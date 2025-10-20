import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject as RxSubject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { SchemaRegistryService } from '../../services/registry/schema-registry.service';
import { JsonSchemaCompatibilityService } from '../../services/registry/compatibility.service';
import { 
  SchemaVersion, 
  EvolutionAnalysis,
  SchemaChange 
} from '../../models/schema-registry.models';

interface VersionWithAnalysis extends SchemaVersion {
  evolutionAnalysis?: EvolutionAnalysis;
  changesSummary?: {
    breaking: number;
    nonBreaking: number;
    total: number;
  };
  diffWithPrevious?: string;
}

@Component({
  selector: 'app-version-history',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="version-history">
      <div class="history-header">
        <div class="breadcrumb">
          <button class="back-btn" (click)="goBack()">← Back to Subject</button>
          <span class="separator">/</span>
          <span class="current-page">Version History</span>
        </div>
        
        <div class="subject-info" *ngIf="subjectName">
          <h1>{{ subjectName }}</h1>
          <span class="version-count">{{ versions.length }} versions</span>
        </div>
      </div>

      <div class="timeline-controls" *ngIf="!loading && !error && versions.length > 0">
        <div class="view-options">
          <button 
            class="view-btn"
            [class.active]="viewMode === 'timeline'"
            (click)="viewMode = 'timeline'"
          >
            Timeline View
          </button>
          <button 
            class="view-btn"
            [class.active]="viewMode === 'table'"
            (click)="viewMode = 'table'"
          >
            Table View
          </button>
          <button 
            class="view-btn"
            [class.active]="viewMode === 'diff'"
            (click)="viewMode = 'diff'"
          >
            Diff View
          </button>
        </div>

        <div class="filter-controls">
          <select [(ngModel)]="selectedFilter" (change)="applyFilter()">
            <option value="all">All Versions</option>
            <option value="breaking">Breaking Changes Only</option>
            <option value="nonbreaking">Non-Breaking Changes Only</option>
            <option value="major">Major Changes</option>
          </select>
          
          <div class="comparison-controls" *ngIf="viewMode === 'diff'">
            <select [(ngModel)]="compareFromVersion" (change)="updateComparison()">
              <option value="">From Version</option>
              <option *ngFor="let version of versions" [value]="version.version">
                v{{ version.version }}
              </option>
            </select>
            <span class="vs">vs</span>
            <select [(ngModel)]="compareToVersion" (change)="updateComparison()">
              <option value="">To Version</option>
              <option *ngFor="let version of versions" [value]="version.version">
                v{{ version.version }}
              </option>
            </select>
          </div>
        </div>
      </div>

      <!-- Timeline View -->
      <div class="timeline-view" *ngIf="viewMode === 'timeline' && !loading && !error">
        <div class="timeline">
          <div 
            *ngFor="let version of filteredVersions; trackBy: trackByVersion"
            class="timeline-item"
            [class.has-breaking-changes]="version.changesSummary && version.changesSummary.breaking > 0"
            [class.latest]="version.version === versions[0]?.version"
          >
            <div class="timeline-marker">
              <div class="version-number">v{{ version.version }}</div>
              <div class="timeline-line" *ngIf="version !== filteredVersions[filteredVersions.length - 1]"></div>
            </div>
            
            <div class="timeline-content">
              <div class="version-header">
                <h3>Version {{ version.version }}</h3>
                <div class="version-meta">
                  <span class="version-id">ID: {{ version.id }}</span>
                  <span class="version-date" *ngIf="version.createdAt">
                    {{ version.createdAt | date:'medium' }}
                  </span>
                </div>
              </div>

              <div class="changes-summary" *ngIf="version.changesSummary">
                <div class="change-stats">
                  <span class="breaking-changes" *ngIf="version.changesSummary.breaking > 0">
                    {{ version.changesSummary.breaking }} Breaking
                  </span>
                  <span class="non-breaking-changes" *ngIf="version.changesSummary.nonBreaking > 0">
                    {{ version.changesSummary.nonBreaking }} Non-Breaking
                  </span>
                  <span class="total-changes">
                    {{ version.changesSummary.total }} Total Changes
                  </span>
                </div>
              </div>

              <div class="evolution-details" *ngIf="version.evolutionAnalysis">
                <div class="compatibility-status">
                  <span 
                    class="compatibility-indicator"
                    [class.compatible]="version.evolutionAnalysis.isBackwardCompatible"
                    [class.incompatible]="!version.evolutionAnalysis.isBackwardCompatible"
                  >
                    {{ version.evolutionAnalysis.isBackwardCompatible ? '✓ Compatible' : '⚠️ Breaking' }}
                  </span>
                </div>

                <div class="key-changes" *ngIf="version.evolutionAnalysis.changes.length > 0">
                  <div 
                    *ngFor="let change of version.evolutionAnalysis.changes.slice(0, 3)"
                    class="change-item"
                    [class.breaking]="change.breaking"
                  >
                    <span class="change-type">{{ change.type }}</span>
                    <span class="change-description">{{ change.description }}</span>
                  </div>
                  <div class="more-changes" *ngIf="version.evolutionAnalysis.changes.length > 3">
                    +{{ version.evolutionAnalysis.changes.length - 3 }} more changes
                  </div>
                </div>
              </div>

              <div class="version-actions">
                <button class="action-btn primary" (click)="viewVersionDetails(version)">
                  View Schema
                </button>
                <button class="action-btn secondary" (click)="compareWithPrevious(version)"
                        *ngIf="version !== versions[versions.length - 1]">
                  Compare Previous
                </button>
                <button class="action-btn secondary" (click)="evolveFromVersion(version)">
                  Evolve From This
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Table View -->
      <div class="table-view" *ngIf="viewMode === 'table' && !loading && !error">
        <div class="versions-table">
          <div class="table-header">
            <div class="col-version">Version</div>
            <div class="col-date">Date</div>
            <div class="col-changes">Changes</div>
            <div class="col-compatibility">Compatibility</div>
            <div class="col-actions">Actions</div>
          </div>
          
          <div 
            *ngFor="let version of filteredVersions; trackBy: trackByVersion"
            class="table-row"
            [class.latest]="version.version === versions[0]?.version"
          >
            <div class="col-version">
              <span class="version-number">v{{ version.version }}</span>
              <span class="version-id">{{ version.id }}</span>
            </div>
            
            <div class="col-date">
              <span *ngIf="version.createdAt">{{ version.createdAt | date:'short' }}</span>
              <span *ngIf="!version.createdAt" class="no-data">-</span>
            </div>
            
            <div class="col-changes">
              <div class="change-badges" *ngIf="version.changesSummary">
                <span class="badge breaking" *ngIf="version.changesSummary.breaking > 0">
                  {{ version.changesSummary.breaking }}
                </span>
                <span class="badge non-breaking" *ngIf="version.changesSummary.nonBreaking > 0">
                  {{ version.changesSummary.nonBreaking }}
                </span>
              </div>
              <span *ngIf="!version.changesSummary" class="no-data">-</span>
            </div>
            
            <div class="col-compatibility">
              <span 
                *ngIf="version.evolutionAnalysis"
                class="compatibility-status"
                [class.compatible]="version.evolutionAnalysis.isBackwardCompatible"
                [class.incompatible]="!version.evolutionAnalysis.isBackwardCompatible"
              >
                {{ version.evolutionAnalysis.isBackwardCompatible ? 'Compatible' : 'Breaking' }}
              </span>
              <span *ngIf="!version.evolutionAnalysis" class="no-data">-</span>
            </div>
            
            <div class="col-actions">
              <div class="table-actions">
                <button class="mini-btn" (click)="viewVersionDetails(version)">View</button>
                <button class="mini-btn" (click)="compareWithPrevious(version)"
                        *ngIf="version !== versions[versions.length - 1]">Diff</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Diff View -->
      <div class="diff-view" *ngIf="viewMode === 'diff' && !loading && !error">
        <div class="diff-container" *ngIf="comparisonResult">
          <div class="diff-header">
            <h3>Version Comparison</h3>
            <div class="comparison-info">
              Comparing v{{ compareFromVersion }} → v{{ compareToVersion }}
            </div>
          </div>
          
          <div class="diff-content">
            <div class="schema-comparison">
              <div class="schema-side">
                <h4>Version {{ compareFromVersion }}</h4>
                <pre class="schema-preview">{{ fromSchema }}</pre>
              </div>
              
              <div class="changes-middle">
                <div class="changes-summary">
                  <div class="summary-stats">
                    <span class="stat breaking" *ngIf="hasBreakingChanges(comparisonResult.changes)">
                      {{ getBreakingChangesCount(comparisonResult.changes) }} Breaking
                    </span>
                    <span class="stat non-breaking">
                      {{ getNonBreakingChangesCount(comparisonResult.changes) }} Non-Breaking
                    </span>
                  </div>
                  
                  <div class="changes-list">
                    <div 
                      *ngFor="let change of comparisonResult.changes"
                      class="change-detail"
                      [class.breaking]="change.breaking"
                    >
                      <span class="change-icon">{{ change.breaking ? '⚠️' : 'ℹ️' }}</span>
                      <div class="change-info">
                        <span class="change-type">{{ change.type }}</span>
                        <span class="change-description">{{ change.description }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div class="schema-side">
                <h4>Version {{ compareToVersion }}</h4>
                <pre class="schema-preview">{{ toSchema }}</pre>
              </div>
            </div>
          </div>
        </div>
        
        <div class="no-comparison" *ngIf="!comparisonResult && compareFromVersion && compareToVersion">
          <p>Select two different versions to compare schemas and see evolution changes.</p>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-state" *ngIf="loading">
        <div class="spinner"></div>
        <p>Loading version history...</p>
      </div>

      <!-- Error State -->
      <div class="error-state" *ngIf="error">
        <div class="error-icon">⚠️</div>
        <h3>Error Loading Version History</h3>
        <p>{{ error }}</p>
        <button class="retry-btn" (click)="loadVersionHistory()">Retry</button>
      </div>

      <!-- Empty State -->
      <div class="empty-state" *ngIf="!loading && !error && versions.length === 0">
        <div class="empty-icon">📋</div>
        <h3>No Versions Found</h3>
        <p>This subject has no versions registered in the schema registry.</p>
      </div>
    </div>
  `,
  styles: [`
    .version-history {
      padding: 20px;
      height: 100%;
      overflow-y: auto;
    }

    .history-header {
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

    .subject-info {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .subject-info h1 {
      margin: 0;
      color: #333;
    }

    .version-count {
      background: #e3f2fd;
      color: #1976d2;
      padding: 4px 12px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
    }

    .timeline-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 24px;
      padding: 16px;
      background: #f5f5f5;
      border-radius: 8px;
    }

    .view-options {
      display: flex;
      gap: 4px;
    }

    .view-btn {
      padding: 8px 16px;
      border: 1px solid #ddd;
      background: white;
      cursor: pointer;
      font-size: 14px;
    }

    .view-btn.active {
      background-color: #2196f3;
      color: white;
      border-color: #2196f3;
    }

    .filter-controls {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .filter-controls select {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
    }

    .comparison-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .vs {
      font-weight: bold;
      color: #666;
    }

    /* Timeline View Styles */
    .timeline {
      position: relative;
      padding-left: 40px;
    }

    .timeline-item {
      position: relative;
      margin-bottom: 40px;
      display: flex;
      align-items: flex-start;
    }

    .timeline-marker {
      position: absolute;
      left: -40px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    .version-number {
      background: #2196f3;
      color: white;
      padding: 8px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: bold;
      min-width: 60px;
      text-align: center;
    }

    .timeline-item.latest .version-number {
      background: #4caf50;
    }

    .timeline-item.has-breaking-changes .version-number {
      background: #f44336;
    }

    .timeline-line {
      width: 2px;
      height: 60px;
      background: #e0e0e0;
      margin-top: 8px;
    }

    .timeline-content {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
      width: 100%;
      margin-left: 20px;
    }

    .version-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .version-header h3 {
      margin: 0;
      color: #333;
    }

    .version-meta {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #666;
    }

    .changes-summary {
      margin-bottom: 16px;
    }

    .change-stats {
      display: flex;
      gap: 12px;
    }

    .breaking-changes {
      background: #ffeaea;
      color: #d32f2f;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
    }

    .non-breaking-changes {
      background: #e8f5e8;
      color: #388e3c;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
    }

    .total-changes {
      background: #e3f2fd;
      color: #1976d2;
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
    }

    .compatibility-indicator.compatible {
      color: #4caf50;
    }

    .compatibility-indicator.incompatible {
      color: #f44336;
    }

    .key-changes {
      margin-top: 12px;
    }

    .change-item {
      display: flex;
      gap: 8px;
      margin-bottom: 8px;
      padding: 8px;
      border-radius: 4px;
    }

    .change-item.breaking {
      background: #ffeaea;
    }

    .change-item:not(.breaking) {
      background: #f9f9f9;
    }

    .change-type {
      font-weight: bold;
      font-size: 12px;
      color: #666;
    }

    .change-description {
      font-size: 13px;
    }

    .more-changes {
      font-size: 12px;
      color: #666;
      font-style: italic;
    }

    .version-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
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

    /* Table View Styles */
    .versions-table {
      background: white;
      border-radius: 8px;
      overflow: hidden;
      border: 1px solid #e0e0e0;
    }

    .table-header {
      display: grid;
      grid-template-columns: 120px 140px 120px 120px 120px;
      background: #f5f5f5;
      padding: 12px;
      font-weight: bold;
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
    }

    .table-row {
      display: grid;
      grid-template-columns: 120px 140px 120px 120px 120px;
      padding: 12px;
      border-bottom: 1px solid #f0f0f0;
      align-items: center;
    }

    .table-row.latest {
      background: #e8f5e8;
    }

    .col-version {
      display: flex;
      flex-direction: column;
    }

    .version-number {
      font-weight: bold;
    }

    .version-id {
      font-size: 11px;
      color: #666;
    }

    .change-badges {
      display: flex;
      gap: 4px;
    }

    .badge {
      padding: 2px 6px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: bold;
    }

    .badge.breaking {
      background: #ffeaea;
      color: #d32f2f;
    }

    .badge.non-breaking {
      background: #e8f5e8;
      color: #388e3c;
    }

    .compatibility-status.compatible {
      color: #4caf50;
    }

    .compatibility-status.incompatible {
      color: #f44336;
    }

    .no-data {
      color: #ccc;
      font-style: italic;
    }

    .table-actions {
      display: flex;
      gap: 4px;
    }

    .mini-btn {
      padding: 4px 8px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }

    /* Diff View Styles */
    .diff-container {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
    }

    .diff-header {
      margin-bottom: 20px;
    }

    .diff-header h3 {
      margin: 0 0 8px 0;
    }

    .comparison-info {
      font-size: 14px;
      color: #666;
    }

    .schema-comparison {
      display: grid;
      grid-template-columns: 1fr 300px 1fr;
      gap: 20px;
      height: 600px;
    }

    .schema-side h4 {
      margin: 0 0 12px 0;
      color: #333;
    }

    .schema-preview {
      background: #f8f8f8;
      padding: 12px;
      border-radius: 4px;
      border: 1px solid #e0e0e0;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      overflow: auto;
      height: 100%;
    }

    .changes-middle {
      border-left: 1px solid #e0e0e0;
      border-right: 1px solid #e0e0e0;
      padding: 0 16px;
    }

    .summary-stats {
      display: flex;
      gap: 8px;
      margin-bottom: 16px;
    }

    .stat {
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
    }

    .stat.breaking {
      background: #ffeaea;
      color: #d32f2f;
    }

    .stat.non-breaking {
      background: #e8f5e8;
      color: #388e3c;
    }

    .changes-list {
      max-height: 500px;
      overflow-y: auto;
    }

    .change-detail {
      display: flex;
      gap: 8px;
      margin-bottom: 12px;
      padding: 8px;
      border-radius: 4px;
      background: #f9f9f9;
    }

    .change-detail.breaking {
      background: #ffeaea;
    }

    .change-icon {
      flex-shrink: 0;
    }

    .change-info {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .change-type {
      font-weight: bold;
      font-size: 12px;
      color: #666;
    }

    .change-description {
      font-size: 13px;
    }

    .no-comparison {
      text-align: center;
      padding: 40px;
      color: #666;
    }

    /* Common States */
    .loading-state, .error-state, .empty-state {
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

    @media (max-width: 768px) {
      .timeline-controls {
        flex-direction: column;
        gap: 16px;
      }
      
      .schema-comparison {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto auto;
      }
      
      .changes-middle {
        border: none;
        padding: 16px 0;
      }
    }
  `]
})
export class VersionHistoryComponent implements OnInit, OnDestroy {
  private destroy$ = new RxSubject<void>();
  
  // Component state
  subjectName: string = '';
  versions: VersionWithAnalysis[] = [];
  filteredVersions: VersionWithAnalysis[] = [];
  loading = false;
  error: string | null = null;
  
  // View controls
  viewMode: 'timeline' | 'table' | 'diff' = 'timeline';
  selectedFilter = 'all';
  
  // Comparison state
  compareFromVersion: number | string = '';
  compareToVersion: number | string = '';
  comparisonResult: EvolutionAnalysis | null = null;
  fromSchema = '';
  toSchema = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private schemaRegistry: SchemaRegistryService,
    private compatibilityService: JsonSchemaCompatibilityService
  ) {}

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.subjectName = params['subjectName'];
        if (this.subjectName) {
          this.loadVersionHistory();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadVersionHistory(): Promise<void> {
    if (!this.subjectName) return;
    
    this.loading = true;
    this.error = null;

    try {
      // Get all version numbers
      const versionNumbers = await this.schemaRegistry.getSubjectVersions(this.subjectName).toPromise() || [];
      
      // Get detailed version information
      const versionDetails = await Promise.all(
        versionNumbers.map(async (versionNum): Promise<VersionWithAnalysis> => {
          const version = await this.schemaRegistry.getSchemaVersion(this.subjectName, versionNum).toPromise();
          return version!;
        })
      );

      // Sort versions by version number (descending - newest first)
      this.versions = versionDetails.sort((a, b) => b.version - a.version);
      
      // Analyze evolution for each version (except the first one)
      await this.analyzeEvolution();
      
      this.filteredVersions = [...this.versions];
      
    } catch (error: any) {
      this.error = error.message || 'Failed to load version history';
      console.error('Error loading version history:', error);
    } finally {
      this.loading = false;
    }
  }

  private async analyzeEvolution(): Promise<void> {
    for (let i = 1; i < this.versions.length; i++) {
      const currentVersion = this.versions[i];
      const previousVersion = this.versions[i - 1];
      
      try {
        // Parse schemas
        const currentSchema = JSON.parse(currentVersion.schema);
        const previousSchema = JSON.parse(previousVersion.schema);
        
        // Analyze evolution
        const analysis = this.compatibilityService.analyzeEvolution(previousSchema, currentSchema);
        
        currentVersion.evolutionAnalysis = analysis;
        currentVersion.changesSummary = {
          breaking: analysis.changes.filter((c: SchemaChange) => c.breaking).length,
          nonBreaking: analysis.changes.filter((c: SchemaChange) => !c.breaking).length,
          total: analysis.changes.length
        };
        
      } catch (error) {
        console.warn(`Failed to analyze evolution for version ${currentVersion.version}:`, error);
      }
    }
  }

  applyFilter(): void {
    switch (this.selectedFilter) {
      case 'breaking':
        this.filteredVersions = this.versions.filter(v => 
          v.changesSummary && v.changesSummary.breaking > 0
        );
        break;
      case 'nonbreaking':
        this.filteredVersions = this.versions.filter(v => 
          v.changesSummary && v.changesSummary.nonBreaking > 0 && v.changesSummary.breaking === 0
        );
        break;
      case 'major':
        this.filteredVersions = this.versions.filter(v => 
          v.changesSummary && v.changesSummary.total >= 5
        );
        break;
      default:
        this.filteredVersions = [...this.versions];
    }
  }

  async updateComparison(): Promise<void> {
    if (!this.compareFromVersion || !this.compareToVersion || 
        this.compareFromVersion === this.compareToVersion) {
      this.comparisonResult = null;
      return;
    }

    try {
      const fromVersion = this.versions.find(v => v.version == this.compareFromVersion);
      const toVersion = this.versions.find(v => v.version == this.compareToVersion);
      
      if (!fromVersion || !toVersion) return;
      
      const fromSchema = JSON.parse(fromVersion.schema);
      const toSchema = JSON.parse(toVersion.schema);
      
      this.comparisonResult = this.compatibilityService.analyzeEvolution(fromSchema, toSchema);
      this.fromSchema = JSON.stringify(fromSchema, null, 2);
      this.toSchema = JSON.stringify(toSchema, null, 2);
      
    } catch (error) {
      console.error('Error comparing versions:', error);
      this.comparisonResult = null;
    }
  }

  trackByVersion(index: number, version: VersionWithAnalysis): number {
    return version.version;
  }

  goBack(): void {
    this.router.navigate(['/registry/subject', this.subjectName, 'details']);
  }

  viewVersionDetails(version: VersionWithAnalysis): void {
    this.router.navigate(['/registry/subject', this.subjectName, 'version', version.version]);
  }

  compareWithPrevious(version: VersionWithAnalysis): void {
    const currentIndex = this.versions.findIndex(v => v.version === version.version);
    const previousVersion = this.versions[currentIndex + 1];
    
    if (previousVersion) {
      this.router.navigate(['/registry/subject', this.subjectName, 'compare'], {
        queryParams: {
          from: previousVersion.version,
          to: version.version
        }
      });
    }
  }

  evolveFromVersion(version: VersionWithAnalysis): void {
    this.router.navigate(['/registry/evolve', this.subjectName], {
      queryParams: { fromVersion: version.version }
    });
  }

  // Template helper methods
  getBreakingChangesCount(changes: SchemaChange[]): number {
    return changes ? changes.filter(c => c.breaking).length : 0;
  }

  getNonBreakingChangesCount(changes: SchemaChange[]): number {
    return changes ? changes.filter(c => !c.breaking).length : 0;
  }

  hasBreakingChanges(changes: SchemaChange[]): boolean {
    return changes ? changes.some(c => c.breaking) : false;
  }
}