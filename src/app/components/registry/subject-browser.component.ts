import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject as RxSubject, BehaviorSubject, debounceTime, distinctUntilChanged, switchMap, takeUntil, combineLatest, map } from 'rxjs';

import { SchemaRegistryService } from '../../services/registry/schema-registry.service';
import { RegistryClientService } from '../../services/registry/registry-client.service';
import { Subject as RegistrySubject, SchemaVersion, CompatibilityLevel } from '../../models/schema-registry.models';

interface SubjectWithMetadata {
  name: string;
  latestVersion: number;
  totalVersions: number;
  compatibility: CompatibilityLevel;
  lastModified: string;
  schemaType: string;
}

@Component({
  selector: 'app-subject-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="subject-browser">
      <div class="browser-header">
        <h2>Schema Registry Browser</h2>
        <div class="connection-status" [class.connected]="isConnected" [class.disconnected]="!isConnected">
          <span class="status-indicator"></span>
          {{ isConnected ? 'Connected to Registry' : 'Disconnected' }}
        </div>
      </div>

      <div class="search-filters">
        <div class="search-section">
          <input 
            type="text" 
            class="search-input"
            [(ngModel)]="searchTerm"
            placeholder="Search subjects by name..."
            (input)="onSearchChange($event)"
          >
          <button class="refresh-btn" (click)="loadSubjects()" [disabled]="loading">
            {{ loading ? 'Loading...' : 'Refresh' }}
          </button>
        </div>

        <div class="filter-section">
          <select [(ngModel)]="selectedCompatibility" (change)="onFilterChange()">
            <option value="">All Compatibility Levels</option>
            <option value="BACKWARD">Backward Compatible</option>
            <option value="FORWARD">Forward Compatible</option>
            <option value="FULL">Full Compatible</option>
            <option value="NONE">No Compatibility</option>
          </select>

          <select [(ngModel)]="selectedType" (change)="onFilterChange()">
            <option value="">All Schema Types</option>
            <option value="JSON">JSON Schema</option>
            <option value="AVRO">Avro Schema</option>
            <option value="PROTOBUF">Protocol Buffers</option>
          </select>
        </div>
      </div>

      <div class="subjects-container" *ngIf="!loading && !error">
        <div class="subjects-header">
          <span class="subjects-count">{{ filteredSubjects.length }} subjects found</span>
          <div class="view-options">
            <button 
              class="view-btn"
              [class.active]="viewMode === 'grid'"
              (click)="viewMode = 'grid'"
            >
              Grid
            </button>
            <button 
              class="view-btn"
              [class.active]="viewMode === 'list'"
              (click)="viewMode = 'list'"
            >
              List
            </button>
          </div>
        </div>

        <div class="subjects-content" [class.grid-view]="viewMode === 'grid'" [class.list-view]="viewMode === 'list'">
          <div 
            *ngFor="let subject of filteredSubjects; trackBy: trackBySubjectName"
            class="subject-card"
            (click)="onSubjectSelect(subject)"
          >
            <div class="subject-header">
              <h3 class="subject-name">{{ subject.name }}</h3>
              <span class="compatibility-badge" [attr.data-level]="subject.compatibility">
                {{ subject.compatibility }}
              </span>
            </div>
            
            <div class="subject-info">
              <div class="info-item">
                <span class="label">Latest Version:</span>
                <span class="value">v{{ subject.latestVersion }}</span>
              </div>
              <div class="info-item">
                <span class="label">Total Versions:</span>
                <span class="value">{{ subject.totalVersions }}</span>
              </div>
              <div class="info-item">
                <span class="label">Schema Type:</span>
                <span class="value">{{ subject.schemaType }}</span>
              </div>
              <div class="info-item">
                <span class="label">Last Modified:</span>
                <span class="value">{{ subject.lastModified }}</span>
              </div>
            </div>

            <div class="subject-actions">
              <button class="action-btn primary" (click)="viewSubjectDetails($event, subject)">
                View Details
              </button>
              <button class="action-btn secondary" (click)="compareVersions($event, subject)">
                Compare Versions
              </button>
              <button class="action-btn secondary" (click)="evolveSchema($event, subject)">
                Evolve Schema
              </button>
            </div>
          </div>
        </div>
      </div>

      <div class="loading-state" *ngIf="loading">
        <div class="spinner"></div>
        <p>Loading subjects from registry...</p>
      </div>

      <div class="error-state" *ngIf="error">
        <div class="error-icon">⚠️</div>
        <h3>Connection Error</h3>
        <p>{{ error }}</p>
        <button class="retry-btn" (click)="loadSubjects()">Retry Connection</button>
      </div>

      <div class="empty-state" *ngIf="!loading && !error && filteredSubjects.length === 0 && subjects.length === 0">
        <div class="empty-icon">📋</div>
        <h3>No Subjects Found</h3>
        <p>The registry appears to be empty or no subjects match your search criteria.</p>
        <button class="action-btn primary" (click)="createNewSubject()">Create First Subject</button>
      </div>

      <div class="no-matches-state" *ngIf="!loading && !error && filteredSubjects.length === 0 && subjects.length > 0">
        <div class="empty-icon">🔍</div>
        <h3>No Matches Found</h3>
        <p>No subjects match your current search and filter criteria.</p>
        <button class="action-btn secondary" (click)="clearFilters()">Clear Filters</button>
      </div>
    </div>
  `,
  styles: [`
    .subject-browser {
      padding: 20px;
      height: 100%;
      display: flex;
      flex-direction: column;
    }

    .browser-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
    }

    .connection-status {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 14px;
    }

    .connection-status.connected {
      background-color: #e8f5e8;
      color: #2e7d2e;
      border: 1px solid #4caf50;
    }

    .connection-status.disconnected {
      background-color: #ffeaea;
      color: #c62828;
      border: 1px solid #f44336;
    }

    .status-indicator {
      width: 8px;
      height: 8px;
      border-radius: 50%;
    }

    .connected .status-indicator {
      background-color: #4caf50;
    }

    .disconnected .status-indicator {
      background-color: #f44336;
    }

    .search-filters {
      background: #f5f5f5;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .search-section {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
    }

    .search-input {
      flex: 1;
      padding: 10px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }

    .refresh-btn {
      padding: 10px 20px;
      background-color: #2196f3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
    }

    .refresh-btn:disabled {
      background-color: #ccc;
      cursor: not-allowed;
    }

    .filter-section {
      display: flex;
      gap: 12px;
    }

    .filter-section select {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }

    .subjects-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .view-options {
      display: flex;
      gap: 4px;
    }

    .view-btn {
      padding: 6px 12px;
      border: 1px solid #ddd;
      background: white;
      cursor: pointer;
      font-size: 12px;
    }

    .view-btn.active {
      background-color: #2196f3;
      color: white;
      border-color: #2196f3;
    }

    .subjects-content {
      flex: 1;
      overflow-y: auto;
    }

    .grid-view {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
      gap: 16px;
    }

    .list-view .subject-card {
      margin-bottom: 12px;
    }

    .subject-card {
      border: 1px solid #ddd;
      border-radius: 8px;
      padding: 16px;
      cursor: pointer;
      transition: all 0.2s;
      background: white;
    }

    .subject-card:hover {
      border-color: #2196f3;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
    }

    .subject-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 12px;
    }

    .subject-name {
      margin: 0;
      font-size: 18px;
      color: #333;
    }

    .compatibility-badge {
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
    }

    .compatibility-badge[data-level="BACKWARD"] { background: #e3f2fd; color: #1976d2; }
    .compatibility-badge[data-level="FORWARD"] { background: #f3e5f5; color: #7b1fa2; }
    .compatibility-badge[data-level="FULL"] { background: #e8f5e8; color: #388e3c; }
    .compatibility-badge[data-level="NONE"] { background: #ffeaea; color: #d32f2f; }

    .subject-info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      margin-bottom: 16px;
    }

    .info-item {
      display: flex;
      flex-direction: column;
    }

    .info-item .label {
      font-size: 12px;
      color: #666;
      font-weight: 500;
    }

    .info-item .value {
      font-size: 14px;
      color: #333;
    }

    .subject-actions {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }

    .action-btn {
      padding: 6px 12px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
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

    .loading-state, .error-state, .empty-state, .no-matches-state {
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

    .error-icon, .empty-icon {
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
  `]
})
export class SubjectBrowserComponent implements OnInit, OnDestroy {
  private destroy$ = new RxSubject<void>();
  private searchSubject = new BehaviorSubject<string>('');

  // Component state
  subjects: SubjectWithMetadata[] = [];
  filteredSubjects: SubjectWithMetadata[] = [];
  loading = false;
  error: string | null = null;
  isConnected = false;

  // Search and filter state
  searchTerm = '';
  selectedCompatibility = '';
  selectedType = '';
  viewMode: 'grid' | 'list' = 'grid';

  constructor(
    private schemaRegistry: SchemaRegistryService,
    private registryClient: RegistryClientService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.setupSearch();
    this.checkConnection();
    this.loadSubjects();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearch(): void {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(searchTerm => {
        this.applyFilters();
      });
  }

  private async checkConnection(): Promise<void> {
    try {
      const status = await this.schemaRegistry.testConnection().toPromise();
      this.isConnected = status?.connected || false;
    } catch (error) {
      this.isConnected = false;
      console.error('Registry connection check failed:', error);
    }
  }

  async loadSubjects(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      // Get all subjects
      const subjectNames = await this.schemaRegistry.getSubjects().toPromise() || [];
      
      // Get detailed information for each subject
        const subjectDetails = await Promise.all(
        subjectNames.map(async (subjectName): Promise<SubjectWithMetadata> => {
          try {
            // Get versions
            const versions = await this.schemaRegistry.getSubjectVersions(subjectName).toPromise() || [];
            const latestVersion = Math.max(...versions);
            
            // Get latest schema details
            const latestSchema = await this.schemaRegistry.getSchemaVersion(subjectName, latestVersion).toPromise();
            
            // Get subject compatibility level
            let compatibility: CompatibilityLevel = 'BACKWARD'; // default
            try {
              const compatibilityResult = await this.schemaRegistry.getSubjectCompatibility(subjectName).toPromise();
              compatibility = compatibilityResult || 'BACKWARD';
            } catch (e) {
              console.warn(`Could not get compatibility for ${subjectName}, using default`);
            }

            return {
              name: subjectName,
              latestVersion,
              totalVersions: versions.length,
              compatibility,
              lastModified: new Date().toISOString(), // Would come from registry metadata
              schemaType: 'JSON' // Would be parsed from schema
            };
          } catch (error) {
            console.error(`Error loading details for subject ${subjectName}:`, error);
            return {
              name: subjectName,
              latestVersion: 1,
              totalVersions: 1,
              compatibility: 'BACKWARD' as CompatibilityLevel,
              lastModified: new Date().toISOString(),
              schemaType: 'JSON'
            };
          }
        })
      );      this.subjects = subjectDetails.sort((a, b) => a.name.localeCompare(b.name));
      this.applyFilters();
      this.isConnected = true;
      
    } catch (error: any) {
      this.error = error.message || 'Failed to load subjects from registry';
      this.isConnected = false;
      console.error('Error loading subjects:', error);
    } finally {
      this.loading = false;
    }
  }

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;
    this.searchSubject.next(this.searchTerm);
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filteredSubjects = this.subjects.filter(subject => {
      // Search term filter
      const matchesSearch = !this.searchTerm || 
        subject.name.toLowerCase().includes(this.searchTerm.toLowerCase());

      // Compatibility filter
      const matchesCompatibility = !this.selectedCompatibility || 
        subject.compatibility === this.selectedCompatibility;

      // Type filter
      const matchesType = !this.selectedType || 
        subject.schemaType === this.selectedType;

      return matchesSearch && matchesCompatibility && matchesType;
    });
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedCompatibility = '';
    this.selectedType = '';
    this.searchSubject.next('');
    this.applyFilters();
  }

  trackBySubjectName(index: number, subject: SubjectWithMetadata): string {
    return subject.name;
  }

  onSubjectSelect(subject: SubjectWithMetadata): void {
    this.router.navigate(['/registry/subject', subject.name]);
  }

  viewSubjectDetails(event: Event, subject: SubjectWithMetadata): void {
    event.stopPropagation();
    this.router.navigate(['/registry/subject', subject.name, 'details']);
  }

  compareVersions(event: Event, subject: SubjectWithMetadata): void {
    event.stopPropagation();
    this.router.navigate(['/registry/subject', subject.name, 'compare']);
  }

  evolveSchema(event: Event, subject: SubjectWithMetadata): void {
    event.stopPropagation();
    this.router.navigate(['/registry/evolve', subject.name]);
  }

  createNewSubject(): void {
    this.router.navigate(['/schema-editor'], { 
      queryParams: { mode: 'registry' } 
    });
  }
}