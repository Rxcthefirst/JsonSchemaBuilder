import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject as RxSubject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { SchemaRegistryService } from '../../../services/registry/schema-registry.service';
import { JsonSchemaCompatibilityService } from '../../../services/registry/compatibility.service';
import { 
  SchemaVersion, 
  EvolutionAnalysis,
  SchemaChange 
} from '../../../models/schema-registry.models';

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
  templateUrl: './version-history.component.html',
  styleUrl: './version-history.component.scss'
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