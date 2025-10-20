import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject as RxSubject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { SchemaRegistryService } from '../../services/registry/schema-registry.service';
import { JsonSchemaCompatibilityService } from '../../services/registry/compatibility.service';
import { 
  SchemaVersion, 
  EvolutionAnalysis,
  SchemaChange 
} from '../../models/schema-registry.models';

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
  template: `
    <div class="version-compare">
      <div class="compare-header">
        <div class="breadcrumb">
          <button class="back-btn" (click)="goBack()">← Back to Subject</button>
          <span class="separator">/</span>
          <span class="current-page">Version Comparison</span>
        </div>
        
        <div class="subject-info" *ngIf="context.subjectName">
          <h1>{{ context.subjectName }}</h1>
          <div class="comparison-info" *ngIf="context.fromVersion && context.toVersion">
            Comparing v{{ context.fromVersion.version }} → v{{ context.toVersion.version }}
          </div>
        </div>
      </div>

      <div class="version-selector" *ngIf="!loading && !error">
        <div class="selector-section">
          <div class="version-select-group">
            <label>From Version:</label>
            <select [(ngModel)]="selectedFromVersion" (change)="onVersionSelectionChange()">
              <option value="">Select version</option>
              <option *ngFor="let version of availableVersions" [value]="version.version">
                v{{ version.version }} (ID: {{ version.id }})
              </option>
            </select>
          </div>
          
          <div class="comparison-arrow">→</div>
          
          <div class="version-select-group">
            <label>To Version:</label>
            <select [(ngModel)]="selectedToVersion" (change)="onVersionSelectionChange()">
              <option value="">Select version</option>
              <option *ngFor="let version of availableVersions" [value]="version.version">
                v{{ version.version }} (ID: {{ version.id }})
              </option>
            </select>
          </div>
          
          <button 
            class="swap-btn"
            (click)="swapVersions()"
            [disabled]="!selectedFromVersion || !selectedToVersion"
            title="Swap versions"
          >
            ⟷
          </button>
        </div>

        <div class="view-controls">
          <div class="view-modes">
            <button 
              class="mode-btn"
              [class.active]="viewMode === 'side-by-side'"
              (click)="viewMode = 'side-by-side'"
            >
              Side by Side
            </button>
            <button 
              class="mode-btn"
              [class.active]="viewMode === 'unified'"
              (click)="viewMode = 'unified'"
            >
              Unified Diff
            </button>
            <button 
              class="mode-btn"
              [class.active]="viewMode === 'json-diff'"
              (click)="viewMode = 'json-diff'"
            >
              JSON Diff
            </button>
          </div>

          <div class="diff-options">
            <label>
              <input type="checkbox" [(ngModel)]="showOnlyChanges">
              Show only changes
            </label>
            <label>
              <input type="checkbox" [(ngModel)]="highlightBreaking">
              Highlight breaking changes
            </label>
            <label>
              <input type="checkbox" [(ngModel)]="showLineNumbers">
              Show line numbers
            </label>
          </div>
        </div>
      </div>

      <!-- Comparison Results -->
      <div class="comparison-content" *ngIf="context.evolutionAnalysis && !loading && !error">
        
        <!-- Analysis Summary -->
        <div class="analysis-summary">
          <div class="summary-header">
            <h3>Change Analysis</h3>
            <div class="export-controls">
              <button class="export-btn" (click)="exportComparison()">Export Report</button>
              <button class="export-btn" (click)="shareComparison()">Share Link</button>
            </div>
          </div>
          
          <div class="summary-stats">
            <div class="stat-card">
              <div class="stat-number">{{ context.evolutionAnalysis.changes.length }}</div>
              <div class="stat-label">Total Changes</div>
            </div>
            <div class="stat-card breaking" *ngIf="getBreakingChangesCount() > 0">
              <div class="stat-number">{{ getBreakingChangesCount() }}</div>
              <div class="stat-label">Breaking Changes</div>
            </div>
            <div class="stat-card non-breaking">
              <div class="stat-number">{{ getNonBreakingChangesCount() }}</div>
              <div class="stat-label">Non-Breaking</div>
            </div>
            <div class="stat-card compatibility" [class.compatible]="context.evolutionAnalysis.isBackwardCompatible">
              <div class="stat-indicator">
                {{ context.evolutionAnalysis.isBackwardCompatible ? '✓' : '⚠️' }}
              </div>
              <div class="stat-label">
                {{ context.evolutionAnalysis.isBackwardCompatible ? 'Compatible' : 'Incompatible' }}
              </div>
            </div>
          </div>

          <div class="changes-filter" *ngIf="context.evolutionAnalysis.changes.length > 0">
            <div class="filter-controls">
              <select [(ngModel)]="changeTypeFilter" (change)="applyFilters()">
                <option value="">All Change Types</option>
                <option value="FIELD_ADDED">Field Added</option>
                <option value="FIELD_REMOVED">Field Removed</option>
                <option value="FIELD_TYPE_CHANGED">Type Changed</option>
                <option value="CONSTRAINT_ADDED">Constraint Added</option>
                <option value="CONSTRAINT_REMOVED">Constraint Removed</option>
                <option value="REQUIRED_ADDED">Required Added</option>
                <option value="REQUIRED_REMOVED">Required Removed</option>
              </select>
              
              <select [(ngModel)]="impactFilter" (change)="applyFilters()">
                <option value="">All Impact Levels</option>
                <option value="LOW">Low Impact</option>
                <option value="MEDIUM">Medium Impact</option>
                <option value="HIGH">High Impact</option>
                <option value="CRITICAL">Critical Impact</option>
              </select>
              
              <button class="clear-filters-btn" (click)="clearFilters()" *ngIf="hasActiveFilters()">
                Clear Filters
              </button>
            </div>
          </div>
        </div>

        <!-- Side by Side View -->
        <div class="side-by-side-view" *ngIf="viewMode === 'side-by-side'">
          <div class="schema-comparison">
            <div class="schema-panel">
              <div class="panel-header">
                <h4>Version {{ context.fromVersion?.version }}</h4>
                <div class="panel-meta">
                  <span class="version-id">ID: {{ context.fromVersion?.id }}</span>
                  <span class="version-date" *ngIf="context.fromVersion?.createdAt">
                    {{ context.fromVersion?.createdAt | date:'short' }}
                  </span>
                </div>
              </div>
              <div class="schema-content">
                <pre 
                  class="schema-code"
                  [innerHTML]="getHighlightedSchema('from')"
                ></pre>
              </div>
            </div>

            <div class="changes-panel">
              <div class="panel-header">
                <h4>Changes ({{ filteredChanges.length }})</h4>
              </div>
              <div class="changes-list">
                <div 
                  *ngFor="let change of filteredChanges; trackBy: trackByChange"
                  class="change-item"
                  [class.breaking]="change.breaking"
                  [class.selected]="selectedChange === change"
                  (click)="selectChange(change)"
                >
                  <div class="change-header">
                    <span class="change-type">{{ change.type }}</span>
                    <span class="change-impact" [attr.data-impact]="change.impact">
                      {{ change.impact }}
                    </span>
                    <span class="breaking-badge" *ngIf="change.breaking">Breaking</span>
                  </div>
                  <div class="change-description">{{ change.description }}</div>
                  <div class="change-path" *ngIf="change.field">
                    <code>{{ change.field }}</code>
                  </div>
                  <div class="change-details" *ngIf="change.oldValue || change.newValue">
                    <div class="old-value" *ngIf="change.oldValue">
                      <span class="label">Before:</span>
                      <code>{{ formatValue(change.oldValue) }}</code>
                    </div>
                    <div class="new-value" *ngIf="change.newValue">
                      <span class="label">After:</span>
                      <code>{{ formatValue(change.newValue) }}</code>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div class="schema-panel">
              <div class="panel-header">
                <h4>Version {{ context.toVersion?.version }}</h4>
                <div class="panel-meta">
                  <span class="version-id">ID: {{ context.toVersion?.id }}</span>
                  <span class="version-date" *ngIf="context.toVersion?.createdAt">
                    {{ context.toVersion?.createdAt | date:'short' }}
                  </span>
                </div>
              </div>
              <div class="schema-content">
                <pre 
                  class="schema-code"
                  [innerHTML]="getHighlightedSchema('to')"
                ></pre>
              </div>
            </div>
          </div>
        </div>

        <!-- Unified Diff View -->
        <div class="unified-view" *ngIf="viewMode === 'unified'">
          <div class="diff-header">
            <h4>Unified Diff</h4>
            <div class="diff-legend">
              <span class="legend-item added">+ Added</span>
              <span class="legend-item removed">- Removed</span>
              <span class="legend-item modified">~ Modified</span>
            </div>
          </div>
          <div class="unified-diff">
            <pre class="diff-content" [innerHTML]="getUnifiedDiff()"></pre>
          </div>
        </div>

        <!-- JSON Diff View -->
        <div class="json-diff-view" *ngIf="viewMode === 'json-diff'">
          <div class="diff-header">
            <h4>Structured JSON Diff</h4>
            <div class="json-controls">
              <button class="control-btn" (click)="expandAll()">Expand All</button>
              <button class="control-btn" (click)="collapseAll()">Collapse All</button>
            </div>
          </div>
          <div class="json-diff-tree">
            <div 
              *ngFor="let diff of schemaDiffs"
              class="diff-node"
              [class.breaking]="diff.breaking"
            >
              <div class="node-header">
                <span class="node-path">{{ diff.path }}</span>
                <span class="node-type" [attr.data-type]="diff.type">{{ diff.type }}</span>
              </div>
              <div class="node-description">{{ diff.description }}</div>
              <div class="node-values" *ngIf="diff.oldValue !== undefined || diff.newValue !== undefined">
                <div class="old-value" *ngIf="diff.oldValue !== undefined">
                  <span class="value-label">Old:</span>
                  <code>{{ formatValue(diff.oldValue) }}</code>
                </div>
                <div class="new-value" *ngIf="diff.newValue !== undefined">
                  <span class="value-label">New:</span>
                  <code>{{ formatValue(diff.newValue) }}</code>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Migration Guidance -->
        <div class="migration-section" *ngIf="context.evolutionAnalysis.migrationPath.length > 0">
          <h3>Migration Guidance</h3>
          <div class="migration-steps">
            <div 
              *ngFor="let step of context.evolutionAnalysis.migrationPath; let i = index"
              class="migration-step"
            >
              <div class="step-header">
                <span class="step-number">{{ i + 1 }}</span>
                <span class="step-action">{{ step.action }}</span>
              </div>
              <div class="step-description">{{ step.description }}</div>
              <pre class="step-code" *ngIf="step.code">{{ step.code }}</pre>
            </div>
          </div>
        </div>
      </div>

      <!-- No Comparison State -->
      <div class="no-comparison" *ngIf="!context.evolutionAnalysis && !loading && !error">
        <div class="no-comparison-content">
          <div class="no-comparison-icon">🔍</div>
          <h3>Select Versions to Compare</h3>
          <p>Choose two different versions to see a detailed comparison and evolution analysis.</p>
        </div>
      </div>

      <!-- Loading State -->
      <div class="loading-state" *ngIf="loading">
        <div class="spinner"></div>
        <p>Loading version comparison...</p>
      </div>

      <!-- Error State -->
      <div class="error-state" *ngIf="error">
        <div class="error-icon">⚠️</div>
        <h3>Error Loading Comparison</h3>
        <p>{{ error }}</p>
        <button class="retry-btn" (click)="loadVersions()">Retry</button>
      </div>
    </div>
  `,
  styles: [`
    .version-compare {
      padding: 20px;
      height: 100vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .compare-header {
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

    .subject-info h1 {
      margin: 0;
      color: #333;
    }

    .comparison-info {
      color: #666;
      font-size: 14px;
      font-weight: 500;
    }

    .version-selector {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 24px;
    }

    .selector-section {
      display: flex;
      align-items: end;
      gap: 16px;
      margin-bottom: 16px;
    }

    .version-select-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .version-select-group label {
      font-weight: bold;
      color: #333;
      font-size: 14px;
    }

    .version-select-group select {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      min-width: 200px;
    }

    .comparison-arrow {
      font-size: 20px;
      color: #666;
      margin: 0 8px;
    }

    .swap-btn {
      padding: 8px 12px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
    }

    .swap-btn:disabled {
      background-color: #f5f5f5;
      color: #ccc;
      cursor: not-allowed;
    }

    .view-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 20px;
      border-top: 1px solid #e0e0e0;
      padding-top: 16px;
    }

    .view-modes {
      display: flex;
      gap: 4px;
    }

    .mode-btn {
      padding: 8px 16px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }

    .mode-btn.active {
      background-color: #2196f3;
      color: white;
      border-color: #2196f3;
    }

    .diff-options {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    .diff-options label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 14px;
    }

    .comparison-content {
      flex: 1;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .analysis-summary {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
    }

    .summary-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .summary-header h3 {
      margin: 0;
      color: #333;
    }

    .export-controls {
      display: flex;
      gap: 8px;
    }

    .export-btn {
      padding: 6px 12px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .summary-stats {
      display: flex;
      gap: 16px;
      margin-bottom: 16px;
    }

    .stat-card {
      padding: 16px;
      border-radius: 8px;
      text-align: center;
      min-width: 80px;
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
    }

    .stat-card.breaking {
      background: #ffeaea;
      border-color: #f44336;
    }

    .stat-card.non-breaking {
      background: #e8f5e8;
      border-color: #4caf50;
    }

    .stat-card.compatibility.compatible {
      background: #e8f5e8;
      border-color: #4caf50;
    }

    .stat-card.compatibility:not(.compatible) {
      background: #ffeaea;
      border-color: #f44336;
    }

    .stat-number {
      font-size: 24px;
      font-weight: bold;
      color: #333;
      margin-bottom: 4px;
    }

    .stat-indicator {
      font-size: 24px;
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      font-weight: bold;
    }

    .changes-filter {
      border-top: 1px solid #f0f0f0;
      padding-top: 16px;
    }

    .filter-controls {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .filter-controls select {
      padding: 6px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 13px;
    }

    .clear-filters-btn {
      padding: 6px 12px;
      background: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    /* Side by Side View */
    .schema-comparison {
      display: grid;
      grid-template-columns: 1fr 300px 1fr;
      gap: 20px;
      height: 600px;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }

    .schema-panel {
      display: flex;
      flex-direction: column;
    }

    .changes-panel {
      display: flex;
      flex-direction: column;
      border-left: 1px solid #e0e0e0;
      border-right: 1px solid #e0e0e0;
    }

    .panel-header {
      padding: 12px 16px;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
    }

    .panel-header h4 {
      margin: 0 0 4px 0;
      color: #333;
    }

    .panel-meta {
      display: flex;
      gap: 12px;
      font-size: 12px;
      color: #666;
    }

    .schema-content {
      flex: 1;
      overflow: auto;
    }

    .schema-code {
      padding: 16px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.4;
      margin: 0;
      background: #f8f8f8;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .changes-list {
      flex: 1;
      overflow-y: auto;
      padding: 8px;
    }

    .change-item {
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      margin-bottom: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .change-item:hover {
      border-color: #2196f3;
    }

    .change-item.selected {
      background: #e3f2fd;
      border-color: #2196f3;
    }

    .change-item.breaking {
      border-left: 4px solid #f44336;
    }

    .change-header {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 4px;
      flex-wrap: wrap;
    }

    .change-type {
      font-weight: bold;
      font-size: 12px;
      color: #333;
    }

    .change-impact {
      padding: 2px 6px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: bold;
    }

    .change-impact[data-impact="LOW"] { background: #e8f5e8; color: #388e3c; }
    .change-impact[data-impact="MEDIUM"] { background: #fff3e0; color: #f57c00; }
    .change-impact[data-impact="HIGH"] { background: #ffeaea; color: #d32f2f; }
    .change-impact[data-impact="CRITICAL"] { background: #fce4ec; color: #c2185b; }

    .breaking-badge {
      background: #f44336;
      color: white;
      padding: 2px 6px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: bold;
    }

    .change-description {
      font-size: 13px;
      color: #333;
      margin-bottom: 4px;
    }

    .change-path {
      margin-bottom: 8px;
    }

    .change-path code {
      background: #f5f5f5;
      padding: 2px 4px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
    }

    .change-details {
      font-size: 12px;
    }

    .old-value, .new-value {
      margin: 2px 0;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .label {
      font-weight: bold;
      color: #666;
      min-width: 40px;
    }

    .old-value code {
      background: #ffeaea;
      color: #d32f2f;
      padding: 1px 4px;
      border-radius: 2px;
    }

    .new-value code {
      background: #e8f5e8;
      color: #388e3c;
      padding: 1px 4px;
      border-radius: 2px;
    }

    /* Unified Diff View */
    .unified-view {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }

    .diff-header {
      padding: 12px 16px;
      background: #f8f9fa;
      border-bottom: 1px solid #e0e0e0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .diff-header h4 {
      margin: 0;
      color: #333;
    }

    .diff-legend {
      display: flex;
      gap: 16px;
    }

    .legend-item {
      font-size: 12px;
      font-weight: bold;
    }

    .legend-item.added { color: #388e3c; }
    .legend-item.removed { color: #d32f2f; }
    .legend-item.modified { color: #f57c00; }

    .unified-diff {
      height: 500px;
      overflow: auto;
    }

    .diff-content {
      padding: 16px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      line-height: 1.4;
      margin: 0;
      background: #f8f8f8;
      white-space: pre-wrap;
    }

    /* JSON Diff View */
    .json-diff-view {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }

    .json-controls {
      display: flex;
      gap: 8px;
    }

    .control-btn {
      padding: 4px 8px;
      border: 1px solid #ddd;
      background: white;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }

    .json-diff-tree {
      max-height: 500px;
      overflow-y: auto;
      padding: 16px;
    }

    .diff-node {
      margin-bottom: 16px;
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      background: #f9f9f9;
    }

    .diff-node.breaking {
      border-left: 4px solid #f44336;
      background: #ffeaea;
    }

    .node-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .node-path {
      font-family: 'Courier New', monospace;
      font-weight: bold;
      color: #333;
    }

    .node-type {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: bold;
      text-transform: uppercase;
    }

    .node-type[data-type="added"] { background: #e8f5e8; color: #388e3c; }
    .node-type[data-type="removed"] { background: #ffeaea; color: #d32f2f; }
    .node-type[data-type="modified"] { background: #fff3e0; color: #f57c00; }
    .node-type[data-type="moved"] { background: #e3f2fd; color: #1976d2; }

    .node-description {
      font-size: 13px;
      color: #333;
      margin-bottom: 8px;
    }

    .node-values {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .value-label {
      font-weight: bold;
      color: #666;
      margin-right: 8px;
    }

    .node-values code {
      font-family: 'Courier New', monospace;
      font-size: 11px;
      padding: 2px 4px;
      border-radius: 2px;
    }

    /* Migration Section */
    .migration-section {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 20px;
    }

    .migration-section h3 {
      margin: 0 0 16px 0;
      color: #333;
    }

    .migration-steps {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .migration-step {
      padding: 16px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: #f9f9f9;
    }

    .step-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 8px;
    }

    .step-number {
      background: #2196f3;
      color: white;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      font-weight: bold;
    }

    .step-action {
      font-weight: bold;
      color: #2196f3;
    }

    .step-description {
      color: #333;
      margin-bottom: 8px;
    }

    .step-code {
      background: #f8f8f8;
      padding: 8px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      margin: 0;
      border-left: 4px solid #2196f3;
    }

    /* States */
    .no-comparison {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .no-comparison-content {
      text-align: center;
      color: #666;
    }

    .no-comparison-icon {
      font-size: 64px;
      margin-bottom: 16px;
    }

    .no-comparison-content h3 {
      margin: 0 0 8px 0;
      color: #333;
    }

    .loading-state, .error-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px;
      text-align: center;
      flex: 1;
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

    /* Syntax Highlighting */
    .highlight-added {
      background-color: #e8f5e8;
      color: #388e3c;
    }

    .highlight-removed {
      background-color: #ffeaea;
      color: #d32f2f;
      text-decoration: line-through;
    }

    .highlight-modified {
      background-color: #fff3e0;
      color: #f57c00;
    }

    /* Responsive Design */
    @media (max-width: 1200px) {
      .schema-comparison {
        grid-template-columns: 1fr;
        grid-template-rows: auto auto auto;
        height: auto;
      }
      
      .changes-panel {
        border: none;
        border-top: 1px solid #e0e0e0;
        border-bottom: 1px solid #e0e0e0;
      }
    }

    @media (max-width: 768px) {
      .selector-section {
        flex-direction: column;
        align-items: stretch;
      }
      
      .comparison-arrow {
        text-align: center;
      }
      
      .view-controls {
        flex-direction: column;
        gap: 12px;
      }
      
      .summary-stats {
        flex-wrap: wrap;
      }
    }
  `]
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