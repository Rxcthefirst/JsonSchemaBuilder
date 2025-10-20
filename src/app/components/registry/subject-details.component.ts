import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject as RxSubject, BehaviorSubject, forkJoin } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';

import { SchemaRegistryService } from '../../services/registry/schema-registry.service';
import { RegistryClientService } from '../../services/registry/registry-client.service';
import { 
  Subject as RegistrySubject, 
  SchemaVersion, 
  CompatibilityLevel,
  SubjectVersionResponse 
} from '../../models/schema-registry.models';

interface SubjectDetail {
  name: string;
  versions: SchemaVersion[];
  latestVersion: SchemaVersion;
  compatibility: CompatibilityLevel;
  totalVersions: number;
  schemaType: string;
  createdAt: Date;
  updatedAt: Date;
}

@Component({
  selector: 'app-subject-details',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="subject-details">
      <div class="details-header">
        <div class="breadcrumb">
          <button class="back-btn" (click)="goBack()">← Back to Registry</button>
          <span class="separator">/</span>
          <span class="current-page">Subject Details</span>
        </div>
        
        <div class="subject-title" *ngIf="subjectDetail">
          <h1>{{ subjectDetail.name }}</h1>
          <div class="subject-badges">
            <span class="compatibility-badge" [attr.data-level]="subjectDetail.compatibility">
              {{ subjectDetail.compatibility }}
            </span>
            <span class="type-badge">{{ subjectDetail.schemaType }}</span>
            <span class="version-badge">v{{ subjectDetail.latestVersion.version }}</span>
          </div>
        </div>
      </div>

      <div class="details-content" *ngIf="!loading && !error && subjectDetail">
        <div class="details-grid">
          <!-- Subject Information Panel -->
          <div class="info-panel">
            <h3>Subject Information</h3>
            <div class="info-grid">
              <div class="info-item">
                <span class="label">Subject Name:</span>
                <span class="value">{{ subjectDetail.name }}</span>
              </div>
              <div class="info-item">
                <span class="label">Schema Type:</span>
                <span class="value">{{ subjectDetail.schemaType }}</span>
              </div>
              <div class="info-item">
                <span class="label">Latest Version:</span>
                <span class="value">v{{ subjectDetail.latestVersion.version }}</span>
              </div>
              <div class="info-item">
                <span class="label">Total Versions:</span>
                <span class="value">{{ subjectDetail.totalVersions }}</span>
              </div>
              <div class="info-item">
                <span class="label">Created:</span>
                <span class="value">{{ subjectDetail.createdAt | date:'medium' }}</span>
              </div>
              <div class="info-item">
                <span class="label">Last Updated:</span>
                <span class="value">{{ subjectDetail.updatedAt | date:'medium' }}</span>
              </div>
            </div>
          </div>

          <!-- Compatibility Configuration Panel -->
          <div class="compatibility-panel">
            <h3>Compatibility Configuration</h3>
            <div class="compatibility-content">
              <div class="current-compatibility">
                <span class="label">Current Level:</span>
                <div class="compatibility-display">
                  <span class="compatibility-badge" [attr.data-level]="subjectDetail.compatibility">
                    {{ subjectDetail.compatibility }}
                  </span>
                  <button class="edit-btn" (click)="editCompatibility = true" *ngIf="!editCompatibility">
                    Edit
                  </button>
                </div>
              </div>

              <div class="compatibility-editor" *ngIf="editCompatibility">
                <select [(ngModel)]="newCompatibilityLevel" class="compatibility-select">
                  <option value="BACKWARD">Backward Compatible</option>
                  <option value="BACKWARD_TRANSITIVE">Backward Transitive</option>
                  <option value="FORWARD">Forward Compatible</option>
                  <option value="FORWARD_TRANSITIVE">Forward Transitive</option>
                  <option value="FULL">Full Compatible</option>
                  <option value="FULL_TRANSITIVE">Full Transitive</option>
                  <option value="NONE">No Compatibility</option>
                </select>
                <div class="edit-actions">
                  <button class="save-btn" (click)="saveCompatibility()" [disabled]="savingCompatibility">
                    {{ savingCompatibility ? 'Saving...' : 'Save' }}
                  </button>
                  <button class="cancel-btn" (click)="cancelEditCompatibility()">
                    Cancel
                  </button>
                </div>
              </div>

              <div class="compatibility-description">
                <p>{{ getCompatibilityDescription(subjectDetail.compatibility) }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Schema Preview Panel -->
        <div class="schema-panel">
          <h3>Latest Schema (v{{ subjectDetail.latestVersion.version }})</h3>
          <div class="schema-content">
            <pre class="schema-preview">{{ formatSchema(subjectDetail.latestVersion.schema) }}</pre>
          </div>
          <div class="schema-actions">
            <button class="action-btn primary" (click)="downloadSchema()">
              Download Schema
            </button>
            <button class="action-btn secondary" (click)="copySchema()">
              Copy to Clipboard
            </button>
            <button class="action-btn secondary" (click)="editSchema()">
              Edit Schema
            </button>
          </div>
        </div>

        <!-- Version History Panel -->
        <div class="versions-panel">
          <div class="versions-header">
            <h3>Version History</h3>
            <button class="action-btn secondary" (click)="viewVersionHistory()">
              View Full History
            </button>
          </div>
          
          <div class="versions-list">
            <div 
              *ngFor="let version of subjectDetail.versions.slice(0, 5); trackBy: trackByVersion"
              class="version-item"
              [class.latest]="version.version === subjectDetail.latestVersion.version"
            >
              <div class="version-info">
                <span class="version-number">v{{ version.version }}</span>
                <span class="version-id">ID: {{ version.id }}</span>
                <span class="version-date" *ngIf="version.createdAt">
                  {{ version.createdAt | date:'short' }}
                </span>
              </div>
              <div class="version-actions">
                <button class="view-btn" (click)="viewVersion(version)">View</button>
                <button class="compare-btn" (click)="compareVersions(version)" 
                        *ngIf="version.version !== subjectDetail.latestVersion.version">
                  Compare
                </button>
              </div>
            </div>
          </div>
          
          <div class="show-more" *ngIf="subjectDetail.versions.length > 5">
            <button class="action-btn secondary" (click)="viewVersionHistory()">
              Show All {{ subjectDetail.totalVersions }} Versions
            </button>
          </div>
        </div>

        <!-- Actions Panel -->
        <div class="actions-panel">
          <h3>Actions</h3>
          <div class="action-buttons">
            <button class="action-btn primary" (click)="evolveSchema()">
              Create New Version
            </button>
            <button class="action-btn secondary" (click)="testCompatibility()">
              Test Compatibility
            </button>
            <button class="action-btn secondary" (click)="exportSubject()">
              Export Subject
            </button>
            <button class="action-btn danger" (click)="deleteSubject()" 
                    [disabled]="!canDeleteSubject">
              Delete Subject
            </button>
          </div>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-state" *ngIf="loading">
        <div class="spinner"></div>
        <p>Loading subject details...</p>
      </div>

      <!-- Error State -->
      <div class="error-state" *ngIf="error">
        <div class="error-icon">⚠️</div>
        <h3>Error Loading Subject</h3>
        <p>{{ error }}</p>
        <button class="retry-btn" (click)="loadSubjectDetails()">Retry</button>
      </div>
    </div>
  `,
  styles: [`
    .subject-details {
      padding: 20px;
      height: 100%;
      overflow-y: auto;
    }

    .details-header {
      margin-bottom: 24px;
    }

    .breadcrumb {
      display: flex;
      align-items: center;
      margin-bottom: 16px;
      font-size: 14px;
      color: #666;
    }

    .back-btn {
      background: none;
      border: none;
      color: #2196f3;
      cursor: pointer;
      font-size: 14px;
    }

    .separator {
      margin: 0 8px;
    }

    .subject-title {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .subject-title h1 {
      margin: 0;
      color: #333;
    }

    .subject-badges {
      display: flex;
      gap: 8px;
    }

    .compatibility-badge, .type-badge, .version-badge {
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
    }

    .compatibility-badge[data-level="BACKWARD"] { background: #e3f2fd; color: #1976d2; }
    .compatibility-badge[data-level="FORWARD"] { background: #f3e5f5; color: #7b1fa2; }
    .compatibility-badge[data-level="FULL"] { background: #e8f5e8; color: #388e3c; }
    .compatibility-badge[data-level="NONE"] { background: #ffeaea; color: #d32f2f; }

    .type-badge {
      background: #fff3e0;
      color: #f57c00;
    }

    .version-badge {
      background: #f3e5f5;
      color: #7b1fa2;
    }

    .details-content {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .details-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }

    .info-panel, .compatibility-panel, .schema-panel, .versions-panel, .actions-panel {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
    }

    .info-panel h3, .compatibility-panel h3, .schema-panel h3, .versions-panel h3, .actions-panel h3 {
      margin: 0 0 16px 0;
      color: #333;
      font-size: 18px;
    }

    .info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .info-item {
      display: flex;
      flex-direction: column;
    }

    .info-item .label {
      font-size: 12px;
      color: #666;
      font-weight: 500;
      margin-bottom: 4px;
    }

    .info-item .value {
      font-size: 14px;
      color: #333;
    }

    .compatibility-content {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .current-compatibility {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .compatibility-display {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .edit-btn, .save-btn, .cancel-btn {
      padding: 4px 12px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .edit-btn:hover, .cancel-btn:hover {
      background-color: #f5f5f5;
    }

    .save-btn {
      background-color: #4caf50;
      color: white;
      border-color: #4caf50;
    }

    .save-btn:disabled {
      background-color: #ccc;
      border-color: #ccc;
      cursor: not-allowed;
    }

    .compatibility-editor {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .compatibility-select {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }

    .edit-actions {
      display: flex;
      gap: 8px;
    }

    .compatibility-description {
      padding: 12px;
      background: #f9f9f9;
      border-radius: 4px;
      font-size: 13px;
      color: #666;
    }

    .schema-panel {
      grid-column: 1 / -1;
    }

    .schema-content {
      margin-bottom: 16px;
    }

    .schema-preview {
      background: #f8f8f8;
      padding: 16px;
      border-radius: 4px;
      border: 1px solid #e0e0e0;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      overflow-x: auto;
      max-height: 400px;
      overflow-y: auto;
    }

    .schema-actions {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .versions-panel {
      grid-column: 1 / -1;
    }

    .versions-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .versions-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .version-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
    }

    .version-item.latest {
      background-color: #e8f5e8;
      border-color: #4caf50;
    }

    .version-info {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .version-number {
      font-weight: bold;
      color: #333;
    }

    .version-id {
      font-size: 12px;
      color: #666;
    }

    .version-date {
      font-size: 12px;
      color: #666;
    }

    .version-actions {
      display: flex;
      gap: 8px;
    }

    .view-btn, .compare-btn {
      padding: 4px 8px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }

    .actions-panel {
      grid-column: 1 / -1;
    }

    .action-buttons {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }

    .action-btn {
      padding: 10px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 500;
    }

    .action-btn.primary {
      background-color: #2196f3;
      color: white;
    }

    .action-btn.secondary {
      background-color: #f5f5f5;
      color: #666;
      border: 1px solid #ddd;
    }

    .action-btn.danger {
      background-color: #f44336;
      color: white;
    }

    .action-btn:disabled {
      background-color: #ccc;
      color: #999;
      cursor: not-allowed;
    }

    .loading-state, .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      text-align: center;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 4px solid #f3f3f3;
      border-top: 4px solid #2196f3;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    .error-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .retry-btn {
      padding: 10px 20px;
      background-color: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 16px;
    }

    @media (max-width: 768px) {
      .details-grid {
        grid-template-columns: 1fr;
      }
      
      .subject-title {
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
      }
    }
  `]
})
export class SubjectDetailsComponent implements OnInit, OnDestroy {
  private destroy$ = new RxSubject<void>();
  
  // Component state
  subjectName: string = '';
  subjectDetail: SubjectDetail | null = null;
  loading = false;
  error: string | null = null;
  
  // Compatibility editing state
  editCompatibility = false;
  newCompatibilityLevel: CompatibilityLevel = 'BACKWARD';
  savingCompatibility = false;
  
  // Permissions
  canDeleteSubject = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private schemaRegistry: SchemaRegistryService,
    private registryClient: RegistryClientService
  ) {}

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.subjectName = params['subjectName'];
        if (this.subjectName) {
          this.loadSubjectDetails();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadSubjectDetails(): Promise<void> {
    if (!this.subjectName) return;
    
    this.loading = true;
    this.error = null;

    try {
      // Get subject versions
      const versionNumbers = await this.schemaRegistry.getSubjectVersions(this.subjectName).toPromise() || [];
      
      // Get detailed version information
      const versions = await Promise.all(
        versionNumbers.map(async (versionNum): Promise<SchemaVersion> => {
          const versionDetail = await this.schemaRegistry.getSchemaVersion(this.subjectName, versionNum).toPromise();
          return versionDetail!;
        })
      );

      // Get compatibility level
      let compatibility: CompatibilityLevel = 'BACKWARD';
      try {
        compatibility = await this.schemaRegistry.getSubjectCompatibility(this.subjectName).toPromise() || 'BACKWARD';
      } catch (e) {
        console.warn('Could not get compatibility level, using default');
      }

      // Sort versions by version number (descending)
      const sortedVersions = versions.sort((a, b) => b.version - a.version);
      const latestVersion = sortedVersions[0];

      this.subjectDetail = {
        name: this.subjectName,
        versions: sortedVersions,
        latestVersion,
        compatibility,
        totalVersions: versions.length,
        schemaType: latestVersion.schemaType || 'JSON',
        createdAt: new Date(), // Would come from registry metadata
        updatedAt: new Date()  // Would come from registry metadata
      };

      this.newCompatibilityLevel = compatibility;
      this.canDeleteSubject = true; // Would be based on permissions
      
    } catch (error: any) {
      this.error = error.message || 'Failed to load subject details';
      console.error('Error loading subject details:', error);
    } finally {
      this.loading = false;
    }
  }

  goBack(): void {
    this.router.navigate(['/registry']);
  }

  getCompatibilityDescription(level: CompatibilityLevel): string {
    const descriptions: Record<CompatibilityLevel, string> = {
      'BACKWARD': 'New schema can be used to read data written with the previous schema.',
      'BACKWARD_TRANSITIVE': 'New schema can be used to read data written with all previous schemas.',
      'FORWARD': 'Previous schema can be used to read data written with the new schema.',
      'FORWARD_TRANSITIVE': 'All previous schemas can be used to read data written with the new schema.',
      'FULL': 'New schema is both forward and backward compatible with the previous schema.',
      'FULL_TRANSITIVE': 'New schema is both forward and backward compatible with all previous schemas.',
      'NONE': 'No compatibility checking is performed.'
    };
    return descriptions[level];
  }

  async saveCompatibility(): Promise<void> {
    if (!this.subjectDetail) return;
    
    this.savingCompatibility = true;
    
    try {
      await this.schemaRegistry.setSubjectCompatibility(this.subjectDetail.name, this.newCompatibilityLevel).toPromise();
      this.subjectDetail.compatibility = this.newCompatibilityLevel;
      this.editCompatibility = false;
    } catch (error: any) {
      console.error('Error updating compatibility:', error);
      alert('Failed to update compatibility level: ' + (error.message || 'Unknown error'));
    } finally {
      this.savingCompatibility = false;
    }
  }

  cancelEditCompatibility(): void {
    this.editCompatibility = false;
    this.newCompatibilityLevel = this.subjectDetail?.compatibility || 'BACKWARD';
  }

  formatSchema(schema: string): string {
    try {
      const parsed = JSON.parse(schema);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return schema;
    }
  }

  downloadSchema(): void {
    if (!this.subjectDetail) return;
    
    const schema = this.formatSchema(this.subjectDetail.latestVersion.schema);
    const blob = new Blob([schema], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.subjectDetail.name}-v${this.subjectDetail.latestVersion.version}.json`;
    link.click();
    
    window.URL.revokeObjectURL(url);
  }

  copySchema(): void {
    if (!this.subjectDetail) return;
    
    const schema = this.formatSchema(this.subjectDetail.latestVersion.schema);
    navigator.clipboard.writeText(schema).then(() => {
      alert('Schema copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy schema to clipboard');
    });
  }

  editSchema(): void {
    if (!this.subjectDetail) return;
    
    this.router.navigate(['/schema-editor'], {
      queryParams: {
        mode: 'evolve',
        subject: this.subjectDetail.name,
        version: this.subjectDetail.latestVersion.version
      }
    });
  }

  viewVersionHistory(): void {
    if (!this.subjectDetail) return;
    
    this.router.navigate(['/registry/subject', this.subjectDetail.name, 'versions']);
  }

  viewVersion(version: SchemaVersion): void {
    if (!this.subjectDetail) return;
    
    this.router.navigate(['/registry/subject', this.subjectDetail.name, 'version', version.version]);
  }

  compareVersions(version: SchemaVersion): void {
    if (!this.subjectDetail) return;
    
    this.router.navigate(['/registry/subject', this.subjectDetail.name, 'compare'], {
      queryParams: {
        from: version.version,
        to: this.subjectDetail.latestVersion.version
      }
    });
  }

  evolveSchema(): void {
    if (!this.subjectDetail) return;
    
    this.router.navigate(['/registry/evolve', this.subjectDetail.name]);
  }

  testCompatibility(): void {
    if (!this.subjectDetail) return;
    
    this.router.navigate(['/registry/compatibility-test'], {
      queryParams: { subject: this.subjectDetail.name }
    });
  }

  exportSubject(): void {
    if (!this.subjectDetail) return;
    
    const exportData = {
      subject: this.subjectDetail.name,
      compatibility: this.subjectDetail.compatibility,
      versions: this.subjectDetail.versions.map(v => ({
        version: v.version,
        id: v.id,
        schema: JSON.parse(v.schema)
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.subjectDetail.name}-export.json`;
    link.click();
    
    window.URL.revokeObjectURL(url);
  }

  async deleteSubject(): Promise<void> {
    if (!this.subjectDetail || !this.canDeleteSubject) return;
    
    const confirmed = confirm(
      `Are you sure you want to delete subject "${this.subjectDetail.name}"?\n\n` +
      `This will permanently delete all ${this.subjectDetail.totalVersions} versions. ` +
      `This action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    try {
      await this.schemaRegistry.deleteSubject(this.subjectDetail.name, true).toPromise();
      alert('Subject deleted successfully');
      this.router.navigate(['/registry']);
    } catch (error: any) {
      console.error('Error deleting subject:', error);
      alert('Failed to delete subject: ' + (error.message || 'Unknown error'));
    }
  }

  trackByVersion(index: number, version: SchemaVersion): number {
    return version.version;
  }
}