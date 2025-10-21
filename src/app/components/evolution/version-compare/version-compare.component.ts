import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject as RxSubject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { SchemaRegistryService } from '../../../services/registry/schema-registry.service';
import { JsonSchemaCompatibilityService } from '../../../services/registry/compatibility.service';
import { 
  SchemaVersion, 
  EvolutionAnalysis,
  SchemaChange 
} from '../../../models/schema-registry.models';

interface ComparisonContext {
  subjectName: string;
  fromVersion: SchemaVersion | null;
  toVersion: SchemaVersion | null;
  evolutionAnalysis: EvolutionAnalysis | null;
  fromSchema: any;
  toSchema: any;
}

interface SchemaDiff {
  path: string;
  type: 'added' | 'removed' | 'modified' | 'moved';
  oldValue?: any;
  newValue?: any;
  description: string;
  breaking: boolean;
}

@Component({
  selector: 'app-version-compare',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './version-compare.component.html',
  styleUrl: './version-compare.component.scss'
})
export class VersionCompareComponent implements OnInit, OnDestroy {
  private destroy$ = new RxSubject<void>();
  
  // Component state
  context: ComparisonContext = {
    subjectName: '',
    fromVersion: null,
    toVersion: null,
    evolutionAnalysis: null,
    fromSchema: null,
    toSchema: null
  };

  availableVersions: SchemaVersion[] = [];
  loading = false;
  error: string | null = null;

  // UI state
  selectedFromVersion: number | string = '';
  selectedToVersion: number | string = '';
  viewMode: 'side-by-side' | 'unified' | 'json-diff' = 'side-by-side';
  
  // Display options
  showOnlyChanges = false;
  highlightBreaking = true;
  showLineNumbers = false;

  // Filtering
  changeTypeFilter = '';
  impactFilter = '';
  filteredChanges: SchemaChange[] = [];
  selectedChange: SchemaChange | null = null;

  // Diff data
  schemaDiffs: SchemaDiff[] = [];

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
        this.context.subjectName = params['subjectName'];
        if (this.context.subjectName) {
          this.loadVersions();
        }
      });

    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        if (params['from'] && params['to']) {
          this.selectedFromVersion = parseInt(params['from']);
          this.selectedToVersion = parseInt(params['to']);
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadVersions(): Promise<void> {
    if (!this.context.subjectName) return;

    this.loading = true;
    this.error = null;

    try {
      // Get all version numbers
      const versionNumbers = await this.schemaRegistry.getSubjectVersions(this.context.subjectName).toPromise() || [];
      
      // Get detailed version information
      this.availableVersions = await Promise.all(
        versionNumbers.map(async (versionNum): Promise<SchemaVersion> => {
          const version = await this.schemaRegistry.getSchemaVersion(this.context.subjectName, versionNum).toPromise();
          return version!;
        })
      );

      // Sort by version number (descending)
      this.availableVersions.sort((a, b) => b.version - a.version);

      // Auto-select versions if provided in query params
      if (this.selectedFromVersion && this.selectedToVersion) {
        this.onVersionSelectionChange();
      }

    } catch (error: any) {
      this.error = error.message || 'Failed to load versions';
      console.error('Error loading versions:', error);
    } finally {
      this.loading = false;
    }
  }

  async onVersionSelectionChange(): Promise<void> {
    if (!this.selectedFromVersion || !this.selectedToVersion) {
      this.context.evolutionAnalysis = null;
      return;
    }

    if (this.selectedFromVersion === this.selectedToVersion) {
      alert('Please select two different versions to compare.');
      return;
    }

    this.loading = true;

    try {
      // Find the selected versions
      this.context.fromVersion = this.availableVersions.find(v => v.version == this.selectedFromVersion) || null;
      this.context.toVersion = this.availableVersions.find(v => v.version == this.selectedToVersion) || null;

      if (!this.context.fromVersion || !this.context.toVersion) return;

      // Parse schemas
      this.context.fromSchema = JSON.parse(this.context.fromVersion.schema);
      this.context.toSchema = JSON.parse(this.context.toVersion.schema);

      // Perform compatibility analysis
      this.context.evolutionAnalysis = this.compatibilityService.analyzeEvolution(
        this.context.fromSchema,
        this.context.toSchema
      );

      this.filteredChanges = [...this.context.evolutionAnalysis.changes];
      this.generateSchemaDiffs();

    } catch (error: any) {
      this.error = error.message || 'Failed to analyze version comparison';
      console.error('Error analyzing versions:', error);
    } finally {
      this.loading = false;
    }
  }

  swapVersions(): void {
    const temp = this.selectedFromVersion;
    this.selectedFromVersion = this.selectedToVersion;
    this.selectedToVersion = temp;
    this.onVersionSelectionChange();
  }

  applyFilters(): void {
    if (!this.context.evolutionAnalysis) return;

    this.filteredChanges = this.context.evolutionAnalysis.changes.filter(change => {
      const typeMatch = !this.changeTypeFilter || change.type === this.changeTypeFilter;
      const impactMatch = !this.impactFilter || change.impact === this.impactFilter;
      return typeMatch && impactMatch;
    });
  }

  clearFilters(): void {
    this.changeTypeFilter = '';
    this.impactFilter = '';
    this.applyFilters();
  }

  hasActiveFilters(): boolean {
    return !!this.changeTypeFilter || !!this.impactFilter;
  }

  getBreakingChangesCount(): number {
    return this.context.evolutionAnalysis ? 
      this.context.evolutionAnalysis.changes.filter(c => c.breaking).length : 0;
  }

  getNonBreakingChangesCount(): number {
    return this.context.evolutionAnalysis ? 
      this.context.evolutionAnalysis.changes.filter(c => !c.breaking).length : 0;
  }

  selectChange(change: SchemaChange): void {
    this.selectedChange = change;
    // Could highlight the specific change in the schema view
  }

  getHighlightedSchema(side: 'from' | 'to'): string {
    const schema = side === 'from' ? this.context.fromSchema : this.context.toSchema;
    if (!schema) return '';

    let formatted = JSON.stringify(schema, null, 2);

    // Apply highlighting based on changes
    if (this.context.evolutionAnalysis && this.highlightBreaking) {
      // This would need more sophisticated implementation to highlight specific lines
      // For now, return the formatted schema
    }

    return this.escapeHtml(formatted);
  }

  getUnifiedDiff(): string {
    if (!this.context.fromSchema || !this.context.toSchema) return '';

    // Generate unified diff format
    const fromLines = JSON.stringify(this.context.fromSchema, null, 2).split('\n');
    const toLines = JSON.stringify(this.context.toSchema, null, 2).split('\n');

    let diff = '';
    let lineNum = 1;

    // Simple diff implementation - could be enhanced with proper diff algorithm
    for (let i = 0; i < Math.max(fromLines.length, toLines.length); i++) {
      const fromLine = fromLines[i] || '';
      const toLine = toLines[i] || '';

      if (fromLine === toLine) {
        diff += `  ${lineNum.toString().padStart(3, ' ')}: ${fromLine}\n`;
      } else {
        if (fromLine) {
          diff += `<span class="highlight-removed">- ${lineNum.toString().padStart(3, ' ')}: ${fromLine}</span>\n`;
        }
        if (toLine) {
          diff += `<span class="highlight-added">+ ${lineNum.toString().padStart(3, ' ')}: ${toLine}</span>\n`;
        }
      }
      lineNum++;
    }

    return diff;
  }

  private generateSchemaDiffs(): void {
    this.schemaDiffs = [];
    
    if (!this.context.evolutionAnalysis) return;

    // Convert evolution analysis changes to structured diffs
    this.context.evolutionAnalysis.changes.forEach(change => {
      const diff: SchemaDiff = {
        path: change.field || 'root',
        type: this.mapChangeTypeToNodeType(change.type),
        oldValue: change.oldValue,
        newValue: change.newValue,
        description: change.description,
        breaking: change.breaking
      };
      this.schemaDiffs.push(diff);
    });
  }

  private mapChangeTypeToNodeType(changeType: string): 'added' | 'removed' | 'modified' | 'moved' {
    if (changeType.includes('ADDED')) return 'added';
    if (changeType.includes('REMOVED')) return 'removed';
    if (changeType.includes('CHANGED') || changeType.includes('MODIFIED')) return 'modified';
    return 'modified';
  }

  formatValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  expandAll(): void {
    // Implementation for expanding all JSON tree nodes
  }

  collapseAll(): void {
    // Implementation for collapsing all JSON tree nodes
  }

  exportComparison(): void {
    if (!this.context.evolutionAnalysis) return;

    const report = {
      subject: this.context.subjectName,
      comparison: {
        from: this.context.fromVersion?.version,
        to: this.context.toVersion?.version
      },
      summary: {
        totalChanges: this.context.evolutionAnalysis.changes.length,
        breakingChanges: this.getBreakingChangesCount(),
        isBackwardCompatible: this.context.evolutionAnalysis.isBackwardCompatible
      },
      changes: this.context.evolutionAnalysis.changes,
      migrationPath: this.context.evolutionAnalysis.migrationPath,
      timestamp: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.context.subjectName}-comparison-v${this.context.fromVersion?.version}-to-v${this.context.toVersion?.version}.json`;
    link.click();
    
    window.URL.revokeObjectURL(url);
  }

  shareComparison(): void {
    const url = `${window.location.origin}${window.location.pathname}?from=${this.selectedFromVersion}&to=${this.selectedToVersion}`;
    navigator.clipboard.writeText(url).then(() => {
      alert('Comparison link copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy link to clipboard');
    });
  }

  trackByChange(index: number, change: SchemaChange): string {
    return `${change.type}-${change.field}-${index}`;
  }

  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  goBack(): void {
    this.router.navigate(['/registry/subject', this.context.subjectName, 'details']);
  }
}