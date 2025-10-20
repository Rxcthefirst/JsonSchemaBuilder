import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject as RxSubject, debounceTime, distinctUntilChanged, switchMap, of, EMPTY } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';

import { SchemaRegistryService } from '../../services/registry/schema-registry.service';
import { JsonSchemaCompatibilityService } from '../../services/registry/compatibility.service';
import { 
  SchemaVersion,
  EvolutionAnalysis,
  SchemaChange
} from '../../models/schema-registry.models';

interface CompatibilityTest {
  id: string;
  name: string;
  description: string;
  subjectName?: string;
  baseSchema: any;
  candidateSchema: any;
  compatibilityMode: 'BACKWARD' | 'FORWARD' | 'FULL' | 'NONE';
  analysis: EvolutionAnalysis | null;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
  createdAt: Date;
}

interface TestResult {
  isCompatible: boolean;
  breakingChanges: SchemaChange[];
  warnings: SchemaChange[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: string[];
}

@Component({
  selector: 'app-compatibility-checker',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  template: `
    <div class="compatibility-checker">
      <div class="checker-header">
        <h1>Schema Compatibility Checker</h1>
        <p class="description">
          Test schema compatibility and analyze potential breaking changes before deployment.
          Compare schemas across different compatibility modes and get detailed migration guidance.
        </p>
      </div>

      <div class="checker-content">
        <!-- Test Configuration -->
        <div class="test-config-panel">
          <h2>Create Compatibility Test</h2>
          
          <form [formGroup]="testForm" (ngSubmit)="runCompatibilityTest()" class="config-form">
            <div class="form-group">
              <label for="testName">Test Name*</label>
              <input 
                type="text" 
                id="testName"
                formControlName="testName"
                placeholder="Enter a descriptive name for this test"
                class="form-control"
              >
              <div class="error" *ngIf="testForm.get('testName')?.touched && testForm.get('testName')?.errors?.['required']">
                Test name is required
              </div>
            </div>

            <div class="form-group">
              <label for="description">Description</label>
              <textarea 
                id="description"
                formControlName="description"
                placeholder="Optional description of what this test validates"
                class="form-control"
                rows="2"
              ></textarea>
            </div>

            <div class="form-group">
              <label>Base Schema Source</label>
              <div class="radio-group">
                <label class="radio-option">
                  <input 
                    type="radio" 
                    formControlName="baseSource" 
                    value="registry"
                    (change)="onBaseSourceChange()"
                  >
                  <span>From Registry</span>
                </label>
                <label class="radio-option">
                  <input 
                    type="radio" 
                    formControlName="baseSource" 
                    value="manual"
                    (change)="onBaseSourceChange()"
                  >
                  <span>Manual Input</span>
                </label>
              </div>
            </div>

            <!-- Registry Schema Selection -->
            <div class="registry-selection" *ngIf="testForm.get('baseSource')?.value === 'registry'">
              <div class="form-group">
                <label for="subjectName">Subject Name</label>
                <input 
                  type="text" 
                  id="subjectName"
                  formControlName="subjectName"
                  placeholder="Enter subject name"
                  class="form-control"
                  (input)="onSubjectSearch($event)"
                >
                <div class="suggestions" *ngIf="subjectSuggestions.length > 0">
                  <div 
                    *ngFor="let subject of subjectSuggestions"
                    class="suggestion-item"
                    (click)="selectSubject(subject)"
                  >
                    {{ subject }}
                  </div>
                </div>
              </div>

              <div class="form-group" *ngIf="availableVersions.length > 0">
                <label for="baseVersion">Base Version</label>
                <select id="baseVersion" formControlName="baseVersion" class="form-control">
                  <option value="">Select version</option>
                  <option *ngFor="let version of availableVersions" [value]="version.version">
                    v{{ version.version }} ({{ version.createdAt | date:'short' }})
                  </option>
                </select>
              </div>
            </div>

            <!-- Manual Schema Input -->
            <div class="manual-input" *ngIf="testForm.get('baseSource')?.value === 'manual'">
              <div class="form-group">
                <label for="baseSchema">Base Schema (JSON)*</label>
                <div class="schema-input">
                  <textarea 
                    id="baseSchema"
                    formControlName="baseSchema"
                    placeholder="Paste your base JSON Schema here..."
                    class="form-control schema-textarea"
                    rows="8"
                  ></textarea>
                  <div class="schema-actions">
                    <button type="button" class="action-btn" (click)="formatSchema('base')">Format JSON</button>
                    <button type="button" class="action-btn" (click)="validateSchema('base')">Validate</button>
                    <button type="button" class="action-btn" (click)="clearSchema('base')">Clear</button>
                  </div>
                </div>
                <div class="validation-message" [class.success]="baseSchemaValid === true" [class.error]="baseSchemaValid === false">
                  <span *ngIf="baseSchemaValid === true">✓ Valid JSON Schema</span>
                  <span *ngIf="baseSchemaValid === false">⚠️ {{ baseSchemaError }}</span>
                </div>
              </div>
            </div>

            <div class="form-group">
              <label for="candidateSchema">Candidate Schema (JSON)*</label>
              <div class="schema-input">
                <textarea 
                  id="candidateSchema"
                  formControlName="candidateSchema"
                  placeholder="Paste your candidate JSON Schema here..."
                  class="form-control schema-textarea"
                  rows="8"
                ></textarea>
                <div class="schema-actions">
                  <button type="button" class="action-btn" (click)="formatSchema('candidate')">Format JSON</button>
                  <button type="button" class="action-btn" (click)="validateSchema('candidate')">Validate</button>
                  <button type="button" class="action-btn" (click)="clearSchema('candidate')">Clear</button>
                </div>
              </div>
              <div class="validation-message" [class.success]="candidateSchemaValid === true" [class.error]="candidateSchemaValid === false">
                <span *ngIf="candidateSchemaValid === true">✓ Valid JSON Schema</span>
                <span *ngIf="candidateSchemaValid === false">⚠️ {{ candidateSchemaError }}</span>
              </div>
            </div>

            <div class="form-group">
              <label for="compatibilityMode">Compatibility Mode*</label>
              <select id="compatibilityMode" formControlName="compatibilityMode" class="form-control">
                <option value="BACKWARD">Backward - New schema can read data from old schema</option>
                <option value="FORWARD">Forward - Old schema can read data from new schema</option>
                <option value="FULL">Full - Both backward and forward compatible</option>
                <option value="NONE">None - No compatibility requirements</option>
              </select>
            </div>

            <div class="form-actions">
              <button 
                type="submit" 
                class="run-test-btn"
                [disabled]="!testForm.valid || isRunningTest"
              >
                <span *ngIf="!isRunningTest">Run Compatibility Test</span>
                <span *ngIf="isRunningTest" class="loading">
                  <span class="spinner"></span>
                  Running Test...
                </span>
              </button>
              <button type="button" class="reset-btn" (click)="resetForm()">Reset Form</button>
            </div>
          </form>
        </div>

        <!-- Test Results -->
        <div class="test-results-panel" *ngIf="currentTest">
          <h2>Test Results</h2>
          
          <div class="result-header">
            <div class="test-info">
              <h3>{{ currentTest.name }}</h3>
              <p class="test-description" *ngIf="currentTest.description">{{ currentTest.description }}</p>
              <div class="test-meta">
                <span class="meta-item">Mode: {{ currentTest.compatibilityMode }}</span>
                <span class="meta-item">Created: {{ currentTest.createdAt | date:'short' }}</span>
                <span class="meta-item" *ngIf="currentTest.subjectName">Subject: {{ currentTest.subjectName }}</span>
              </div>
            </div>
            <div class="result-status" [attr.data-status]="currentTest.status">
              <div class="status-indicator">
                <span *ngIf="currentTest.status === 'completed'" class="status-icon">✓</span>
                <span *ngIf="currentTest.status === 'error'" class="status-icon">⚠️</span>
                <span *ngIf="currentTest.status === 'running'" class="spinner"></span>
              </div>
              <span class="status-text">{{ getStatusText() }}</span>
            </div>
          </div>

          <!-- Error State -->
          <div class="error-result" *ngIf="currentTest.status === 'error'">
            <div class="error-content">
              <h4>Test Failed</h4>
              <p>{{ currentTest.error }}</p>
              <button class="retry-btn" (click)="retryTest()">Retry Test</button>
            </div>
          </div>

          <!-- Completed Results -->
          <div class="compatibility-results" *ngIf="currentTest.status === 'completed' && currentTest.analysis">
            
            <!-- Overall Result -->
            <div class="overall-result" [class.compatible]="currentTest.analysis.isBackwardCompatible" [class.incompatible]="!currentTest.analysis.isBackwardCompatible">
              <div class="result-icon">
                <span *ngIf="currentTest.analysis.isBackwardCompatible">✅</span>
                <span *ngIf="!currentTest.analysis.isBackwardCompatible">❌</span>
              </div>
              <div class="result-text">
                <h4>{{ currentTest.analysis.isBackwardCompatible ? 'Compatible' : 'Incompatible' }}</h4>
                <p>{{ getCompatibilityMessage() }}</p>
              </div>
            </div>

            <!-- Summary Stats -->
            <div class="result-summary">
              <div class="summary-stat">
                <div class="stat-number">{{ currentTest.analysis.changes.length }}</div>
                <div class="stat-label">Total Changes</div>
              </div>
              <div class="summary-stat breaking" *ngIf="getBreakingChanges().length > 0">
                <div class="stat-number">{{ getBreakingChanges().length }}</div>
                <div class="stat-label">Breaking Changes</div>
              </div>
              <div class="summary-stat warnings" *ngIf="getWarningChanges().length > 0">
                <div class="stat-number">{{ getWarningChanges().length }}</div>
                <div class="stat-label">Warnings</div>
              </div>
              <div class="summary-stat risk" [attr.data-risk]="getRiskLevel()">
                <div class="stat-indicator">{{ getRiskIcon() }}</div>
                <div class="stat-label">{{ getRiskLevel() }} Risk</div>
              </div>
            </div>

            <!-- Changes Detail -->
            <div class="changes-section" *ngIf="currentTest.analysis.changes.length > 0">
              <div class="section-header">
                <h4>Detected Changes</h4>
                <div class="filter-controls">
                  <select [(ngModel)]="resultsFilter" (change)="applyResultsFilter()">
                    <option value="">All Changes</option>
                    <option value="breaking">Breaking Only</option>
                    <option value="warnings">Warnings Only</option>
                    <option value="safe">Safe Changes</option>
                  </select>
                </div>
              </div>

              <div class="changes-list">
                <div 
                  *ngFor="let change of getFilteredResults(); trackBy: trackByChange"
                  class="change-item"
                  [class.breaking]="change.breaking"
                  [class.warning]="isWarningChange(change)"
                >
                  <div class="change-header">
                    <div class="change-info">
                      <span class="change-type">{{ change.type }}</span>
                      <span class="change-field" *ngIf="change.field">{{ change.field }}</span>
                    </div>
                    <div class="change-indicators">
                      <span class="impact-badge" [attr.data-impact]="change.impact">{{ change.impact }}</span>
                      <span class="breaking-badge" *ngIf="change.breaking">Breaking</span>
                    </div>
                  </div>
                  
                  <div class="change-description">
                    {{ change.description }}
                  </div>

                  <div class="change-details" *ngIf="change.oldValue !== undefined || change.newValue !== undefined">
                    <div class="value-change">
                      <div class="old-value" *ngIf="change.oldValue !== undefined">
                        <span class="label">Before:</span>
                        <code>{{ formatChangeValue(change.oldValue) }}</code>
                      </div>
                      <div class="new-value" *ngIf="change.newValue !== undefined">
                        <span class="label">After:</span>
                        <code>{{ formatChangeValue(change.newValue) }}</code>
                      </div>
                    </div>
                  </div>

                  <div class="mitigation-advice" *ngIf="getMitigationAdvice(change)">
                    <div class="advice-header">💡 Mitigation Advice:</div>
                    <div class="advice-text">{{ getMitigationAdvice(change) }}</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Migration Path -->
            <div class="migration-section" *ngIf="currentTest.analysis.migrationPath.length > 0">
              <h4>Migration Path</h4>
              <div class="migration-steps">
                <div 
                  *ngFor="let step of currentTest.analysis.migrationPath; let i = index"
                  class="migration-step"
                >
                  <div class="step-number">{{ i + 1 }}</div>
                  <div class="step-content">
                    <div class="step-title">{{ step.action }}</div>
                    <div class="step-description">{{ step.description }}</div>
                    <pre class="step-code" *ngIf="step.code">{{ step.code }}</pre>
                  </div>
                </div>
              </div>
            </div>

            <!-- Export Options -->
            <div class="export-section">
              <h4>Export Results</h4>
              <div class="export-options">
                <button class="export-btn" (click)="exportResults('json')">
                  <span class="btn-icon">📄</span>
                  Export as JSON
                </button>
                <button class="export-btn" (click)="exportResults('report')">
                  <span class="btn-icon">📋</span>
                  Generate Report
                </button>
                <button class="export-btn" (click)="shareResults()">
                  <span class="btn-icon">🔗</span>
                  Share Results
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Test History -->
        <div class="test-history-panel" *ngIf="testHistory.length > 0">
          <h2>Test History</h2>
          
          <div class="history-controls">
            <div class="search-box">
              <input 
                type="text" 
                placeholder="Search tests..."
                [(ngModel)]="historySearchTerm"
                (input)="filterHistory()"
                class="search-input"
              >
            </div>
            <button class="clear-history-btn" (click)="clearHistory()">Clear History</button>
          </div>

          <div class="history-list">
            <div 
              *ngFor="let test of filteredHistory; trackBy: trackByTest"
              class="history-item"
              (click)="loadTest(test)"
              [class.active]="currentTest?.id === test.id"
            >
              <div class="history-header">
                <div class="test-name">{{ test.name }}</div>
                <div class="test-date">{{ test.createdAt | date:'short' }}</div>
              </div>
              
              <div class="history-details">
                <span class="detail-item">{{ test.compatibilityMode }}</span>
                <span class="detail-item" *ngIf="test.subjectName">{{ test.subjectName }}</span>
                <span class="status-badge" [attr.data-status]="test.status">{{ test.status }}</span>
              </div>

              <div class="history-result" *ngIf="test.analysis">
                <span class="result-indicator" [class.compatible]="test.analysis.isBackwardCompatible">
                  {{ test.analysis.isBackwardCompatible ? '✅ Compatible' : '❌ Incompatible' }}
                </span>
                <span class="changes-count">{{ test.analysis.changes.length }} changes</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .compatibility-checker {
      padding: 20px;
      max-width: 1400px;
      margin: 0 auto;
    }

    .checker-header {
      margin-bottom: 32px;
      text-align: center;
    }

    .checker-header h1 {
      margin: 0 0 8px 0;
      color: #333;
      font-size: 32px;
    }

    .description {
      color: #666;
      font-size: 16px;
      max-width: 600px;
      margin: 0 auto;
      line-height: 1.5;
    }

    .checker-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto auto;
      gap: 24px;
      grid-template-areas: 
        "config results"
        "history history";
    }

    .test-config-panel {
      grid-area: config;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 24px;
    }

    .test-results-panel {
      grid-area: results;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 24px;
    }

    .test-history-panel {
      grid-area: history;
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 24px;
    }

    .config-form {
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .form-group label {
      font-weight: bold;
      color: #333;
      font-size: 14px;
    }

    .form-control {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }

    .form-control:focus {
      outline: none;
      border-color: #2196f3;
      box-shadow: 0 0 0 2px rgba(33, 150, 243, 0.2);
    }

    .error {
      color: #f44336;
      font-size: 12px;
    }

    .radio-group {
      display: flex;
      gap: 16px;
    }

    .radio-option {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-weight: normal !important;
    }

    .registry-selection, .manual-input {
      position: relative;
    }

    .suggestions {
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: white;
      border: 1px solid #ddd;
      border-top: none;
      border-radius: 0 0 4px 4px;
      max-height: 200px;
      overflow-y: auto;
      z-index: 100;
    }

    .suggestion-item {
      padding: 8px;
      cursor: pointer;
      border-bottom: 1px solid #f0f0f0;
    }

    .suggestion-item:hover {
      background: #f5f5f5;
    }

    .schema-input {
      position: relative;
    }

    .schema-textarea {
      font-family: 'Courier New', monospace;
      font-size: 12px;
      resize: vertical;
      min-height: 150px;
    }

    .schema-actions {
      position: absolute;
      top: 8px;
      right: 8px;
      display: flex;
      gap: 4px;
    }

    .action-btn {
      padding: 4px 8px;
      background: #f8f9fa;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
      font-size: 11px;
    }

    .action-btn:hover {
      background: #e9ecef;
    }

    .validation-message {
      font-size: 12px;
      font-weight: bold;
    }

    .validation-message.success {
      color: #4caf50;
    }

    .validation-message.error {
      color: #f44336;
    }

    .form-actions {
      display: flex;
      gap: 12px;
      justify-content: flex-end;
      padding-top: 16px;
      border-top: 1px solid #f0f0f0;
    }

    .run-test-btn {
      padding: 12px 24px;
      background: #2196f3;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .run-test-btn:disabled {
      background: #ccc;
      cursor: not-allowed;
    }

    .reset-btn {
      padding: 12px 24px;
      background: white;
      color: #666;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
    }

    .loading {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid #f3f3f3;
      border-top: 2px solid #2196f3;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }

    @keyframes spin {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }

    /* Test Results Styles */
    .result-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid #f0f0f0;
    }

    .test-info h3 {
      margin: 0 0 8px 0;
      color: #333;
    }

    .test-description {
      color: #666;
      font-style: italic;
      margin: 0 0 8px 0;
    }

    .test-meta {
      display: flex;
      gap: 16px;
      font-size: 12px;
      color: #999;
    }

    .meta-item {
      padding: 2px 6px;
      background: #f8f9fa;
      border-radius: 4px;
    }

    .result-status {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .result-status[data-status="completed"] .status-text {
      color: #4caf50;
    }

    .result-status[data-status="error"] .status-text {
      color: #f44336;
    }

    .result-status[data-status="running"] .status-text {
      color: #ff9800;
    }

    .status-indicator {
      display: flex;
      align-items: center;
    }

    .status-icon {
      font-size: 20px;
    }

    .error-result {
      background: #ffeaea;
      border: 1px solid #f44336;
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }

    .error-content h4 {
      margin: 0 0 8px 0;
      color: #d32f2f;
    }

    .retry-btn {
      padding: 8px 16px;
      background: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      margin-top: 12px;
    }

    .overall-result {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }

    .overall-result.compatible {
      background: #e8f5e8;
      border: 1px solid #4caf50;
    }

    .overall-result.incompatible {
      background: #ffeaea;
      border: 1px solid #f44336;
    }

    .result-icon {
      font-size: 32px;
    }

    .result-text h4 {
      margin: 0 0 4px 0;
      font-size: 20px;
    }

    .result-text p {
      margin: 0;
      color: #666;
    }

    .result-summary {
      display: flex;
      gap: 16px;
      margin-bottom: 24px;
    }

    .summary-stat {
      padding: 16px;
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      text-align: center;
      min-width: 80px;
    }

    .summary-stat.breaking {
      background: #ffeaea;
      border-color: #f44336;
    }

    .summary-stat.warnings {
      background: #fff3e0;
      border-color: #ff9800;
    }

    .summary-stat.risk {
      background: #f3e5f5;
      border-color: #9c27b0;
    }

    .summary-stat.risk[data-risk="LOW"] {
      background: #e8f5e8;
      border-color: #4caf50;
    }

    .summary-stat.risk[data-risk="HIGH"] {
      background: #ffeaea;
      border-color: #f44336;
    }

    .summary-stat.risk[data-risk="CRITICAL"] {
      background: #fce4ec;
      border-color: #e91e63;
    }

    .stat-number, .stat-indicator {
      font-size: 24px;
      font-weight: bold;
      color: #333;
      margin-bottom: 4px;
    }

    .stat-label {
      font-size: 12px;
      color: #666;
      text-transform: uppercase;
      font-weight: bold;
    }

    .changes-section {
      margin-bottom: 24px;
    }

    .section-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .section-header h4 {
      margin: 0;
      color: #333;
    }

    .filter-controls select {
      padding: 6px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 12px;
    }

    .changes-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .change-item {
      padding: 16px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      background: #f9f9f9;
    }

    .change-item.breaking {
      border-left: 4px solid #f44336;
      background: #ffeaea;
    }

    .change-item.warning {
      border-left: 4px solid #ff9800;
      background: #fff3e0;
    }

    .change-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }

    .change-info {
      display: flex;
      gap: 12px;
      align-items: center;
    }

    .change-type {
      font-weight: bold;
      color: #333;
      font-size: 14px;
    }

    .change-field {
      font-family: 'Courier New', monospace;
      background: #f5f5f5;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 12px;
    }

    .change-indicators {
      display: flex;
      gap: 6px;
    }

    .impact-badge {
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: bold;
      text-transform: uppercase;
    }

    .impact-badge[data-impact="LOW"] { background: #e8f5e8; color: #388e3c; }
    .impact-badge[data-impact="MEDIUM"] { background: #fff3e0; color: #f57c00; }
    .impact-badge[data-impact="HIGH"] { background: #ffeaea; color: #d32f2f; }
    .impact-badge[data-impact="CRITICAL"] { background: #fce4ec; color: #c2185b; }

    .breaking-badge {
      background: #f44336;
      color: white;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      font-weight: bold;
    }

    .change-description {
      color: #333;
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .change-details {
      margin-bottom: 8px;
    }

    .value-change {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .old-value, .new-value {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
    }

    .label {
      font-weight: bold;
      color: #666;
      min-width: 50px;
    }

    .old-value code {
      background: #ffeaea;
      color: #d32f2f;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .new-value code {
      background: #e8f5e8;
      color: #388e3c;
      padding: 2px 6px;
      border-radius: 4px;
    }

    .mitigation-advice {
      background: #e3f2fd;
      border-left: 4px solid #2196f3;
      padding: 8px 12px;
      border-radius: 4px;
      font-size: 12px;
    }

    .advice-header {
      font-weight: bold;
      color: #1976d2;
      margin-bottom: 4px;
    }

    .advice-text {
      color: #333;
      line-height: 1.4;
    }

    /* Migration Section */
    .migration-section {
      margin-bottom: 24px;
    }

    .migration-section h4 {
      margin: 0 0 16px 0;
      color: #333;
    }

    .migration-steps {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .migration-step {
      display: flex;
      gap: 16px;
      padding: 16px;
      background: #f8f9fa;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
    }

    .step-number {
      background: #2196f3;
      color: white;
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      flex-shrink: 0;
    }

    .step-content {
      flex: 1;
    }

    .step-title {
      font-weight: bold;
      color: #333;
      margin-bottom: 4px;
    }

    .step-description {
      color: #666;
      margin-bottom: 8px;
      line-height: 1.4;
    }

    .step-code {
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      padding: 8px;
      font-family: 'Courier New', monospace;
      font-size: 11px;
      margin: 0;
      white-space: pre-wrap;
    }

    /* Export Section */
    .export-section {
      border-top: 1px solid #f0f0f0;
      padding-top: 16px;
    }

    .export-section h4 {
      margin: 0 0 12px 0;
      color: #333;
    }

    .export-options {
      display: flex;
      gap: 12px;
    }

    .export-btn {
      padding: 8px 16px;
      background: white;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 13px;
    }

    .export-btn:hover {
      background: #f5f5f5;
    }

    .btn-icon {
      font-size: 14px;
    }

    /* Test History */
    .history-controls {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
    }

    .search-box {
      flex: 1;
      max-width: 300px;
    }

    .search-input {
      width: 100%;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }

    .clear-history-btn {
      padding: 6px 12px;
      background: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
    }

    .history-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      max-height: 300px;
      overflow-y: auto;
    }

    .history-item {
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      background: #f9f9f9;
      cursor: pointer;
      transition: all 0.2s;
    }

    .history-item:hover {
      background: #f0f0f0;
      border-color: #2196f3;
    }

    .history-item.active {
      background: #e3f2fd;
      border-color: #2196f3;
    }

    .history-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .test-name {
      font-weight: bold;
      color: #333;
    }

    .test-date {
      font-size: 11px;
      color: #999;
    }

    .history-details {
      display: flex;
      gap: 8px;
      align-items: center;
      margin-bottom: 4px;
    }

    .detail-item {
      padding: 2px 6px;
      background: #f0f0f0;
      border-radius: 4px;
      font-size: 11px;
      color: #666;
    }

    .status-badge {
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: bold;
    }

    .status-badge[data-status="completed"] {
      background: #e8f5e8;
      color: #388e3c;
    }

    .status-badge[data-status="error"] {
      background: #ffeaea;
      color: #d32f2f;
    }

    .history-result {
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
    }

    .result-indicator.compatible {
      color: #4caf50;
    }

    .result-indicator:not(.compatible) {
      color: #f44336;
    }

    .changes-count {
      color: #666;
    }

    /* Responsive Design */
    @media (max-width: 1200px) {
      .checker-content {
        grid-template-columns: 1fr;
        grid-template-areas: 
          "config"
          "results"
          "history";
      }
    }

    @media (max-width: 768px) {
      .compatibility-checker {
        padding: 12px;
      }

      .result-header {
        flex-direction: column;
        gap: 12px;
      }

      .result-summary {
        flex-wrap: wrap;
      }

      .export-options {
        flex-direction: column;
      }
    }
  `]
})
export class CompatibilityCheckerComponent implements OnInit, OnDestroy {
  private destroy$ = new RxSubject<void>();
  private subjectSearchTerm$ = new RxSubject<string>();

  testForm: FormGroup;
  isRunningTest = false;

  // Schema validation
  baseSchemaValid: boolean | null = null;
  baseSchemaError = '';
  candidateSchemaValid: boolean | null = null;
  candidateSchemaError = '';

  // Subject suggestions
  subjectSuggestions: string[] = [];
  availableVersions: SchemaVersion[] = [];

  // Current test
  currentTest: CompatibilityTest | null = null;

  // Results filtering
  resultsFilter = '';
  filteredResults: SchemaChange[] = [];

  // Test history
  testHistory: CompatibilityTest[] = [];
  filteredHistory: CompatibilityTest[] = [];
  historySearchTerm = '';

  constructor(
    private formBuilder: FormBuilder,
    private schemaRegistry: SchemaRegistryService,
    private compatibilityService: JsonSchemaCompatibilityService
  ) {
    this.testForm = this.formBuilder.group({
      testName: ['', Validators.required],
      description: [''],
      baseSource: ['manual', Validators.required],
      subjectName: [''],
      baseVersion: [''],
      baseSchema: ['', Validators.required],
      candidateSchema: ['', Validators.required],
      compatibilityMode: ['BACKWARD', Validators.required]
    });
  }

  ngOnInit(): void {
    this.setupSubjectSearch();
    this.loadTestHistory();
    this.setupFormValidation();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSubjectSearch(): void {
    this.subjectSearchTerm$
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(term => {
          if (!term || term.length < 2) return of([]);
          // Since searchSubjects method doesn't exist, use getSubjects and filter
          return this.schemaRegistry.getSubjects().pipe(
            switchMap(subjects => of((subjects as string[]).filter((s: string) => s.toLowerCase().includes(term.toLowerCase())))),
            catchError(() => of([]))
          );
        })
      )
      .subscribe(subjects => {
        this.subjectSuggestions = subjects;
      });
  }

  private setupFormValidation(): void {
    // Update base schema requirement based on source
    this.testForm.get('baseSource')?.valueChanges.subscribe(source => {
      const baseSchemaControl = this.testForm.get('baseSchema');
      const subjectControl = this.testForm.get('subjectName');
      const versionControl = this.testForm.get('baseVersion');

      if (source === 'registry') {
        baseSchemaControl?.clearValidators();
        subjectControl?.setValidators([Validators.required]);
        versionControl?.setValidators([Validators.required]);
      } else {
        baseSchemaControl?.setValidators([Validators.required]);
        subjectControl?.clearValidators();
        versionControl?.clearValidators();
      }

      baseSchemaControl?.updateValueAndValidity();
      subjectControl?.updateValueAndValidity();
      versionControl?.updateValueAndValidity();
    });

    // Auto-validate schemas
    this.testForm.get('baseSchema')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500)
      )
      .subscribe(schema => {
        if (schema && this.testForm.get('baseSource')?.value === 'manual') {
          this.validateSchema('base');
        }
      });

    this.testForm.get('candidateSchema')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500)
      )
      .subscribe(() => {
        this.validateSchema('candidate');
      });
  }

  onBaseSourceChange(): void {
    this.baseSchemaValid = null;
    this.availableVersions = [];
    this.subjectSuggestions = [];
  }

  onSubjectSearch(event: any): void {
    const term = event.target.value;
    this.subjectSearchTerm$.next(term);
    
    if (term && term.length >= 2) {
      this.loadSubjectVersions(term);
    }
  }

  selectSubject(subjectName: string): void {
    this.testForm.patchValue({ subjectName });
    this.subjectSuggestions = [];
    this.loadSubjectVersions(subjectName);
  }

  private async loadSubjectVersions(subjectName: string): Promise<void> {
    try {
      const versionNumbers = await this.schemaRegistry.getSubjectVersions(subjectName).toPromise() || [];
      
      this.availableVersions = await Promise.all(
        versionNumbers.map(async (versionNum): Promise<SchemaVersion> => {
          const version = await this.schemaRegistry.getSchemaVersion(subjectName, versionNum).toPromise();
          return version!;
        })
      );

      this.availableVersions.sort((a, b) => b.version - a.version);
    } catch (error) {
      console.error('Error loading versions:', error);
      this.availableVersions = [];
    }
  }

  validateSchema(type: 'base' | 'candidate'): void {
    const schemaValue = this.testForm.get(`${type}Schema`)?.value;
    
    if (!schemaValue?.trim()) {
      if (type === 'base') {
        this.baseSchemaValid = null;
        this.baseSchemaError = '';
      } else {
        this.candidateSchemaValid = null;
        this.candidateSchemaError = '';
      }
      return;
    }

    try {
      const parsed = JSON.parse(schemaValue);
      
      // Basic JSON Schema validation
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Must be a valid JSON object');
      }

      if (type === 'base') {
        this.baseSchemaValid = true;
        this.baseSchemaError = '';
      } else {
        this.candidateSchemaValid = true;
        this.candidateSchemaError = '';
      }
    } catch (error: any) {
      if (type === 'base') {
        this.baseSchemaValid = false;
        this.baseSchemaError = error.message;
      } else {
        this.candidateSchemaValid = false;
        this.candidateSchemaError = error.message;
      }
    }
  }

  formatSchema(type: 'base' | 'candidate'): void {
    const control = this.testForm.get(`${type}Schema`);
    const value = control?.value;

    if (!value?.trim()) return;

    try {
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 2);
      control?.setValue(formatted);
    } catch (error) {
      alert('Invalid JSON - cannot format');
    }
  }

  clearSchema(type: 'base' | 'candidate'): void {
    this.testForm.get(`${type}Schema`)?.setValue('');
  }

  async runCompatibilityTest(): Promise<void> {
    if (!this.testForm.valid) return;

    this.isRunningTest = true;

    try {
      const formValue = this.testForm.value;
      
      // Create new test
      const test: CompatibilityTest = {
        id: this.generateTestId(),
        name: formValue.testName,
        description: formValue.description,
        subjectName: formValue.baseSource === 'registry' ? formValue.subjectName : undefined,
        baseSchema: await this.getBaseSchema(),
        candidateSchema: JSON.parse(formValue.candidateSchema),
        compatibilityMode: formValue.compatibilityMode,
        analysis: null,
        status: 'running',
        createdAt: new Date()
      };

      this.currentTest = test;
      this.addToHistory(test);

      // Run analysis
      const analysis = this.compatibilityService.analyzeEvolution(
        test.baseSchema,
        test.candidateSchema
      );

      // Update test with results
      test.analysis = analysis;
      test.status = 'completed';
      this.filteredResults = [...analysis.changes];

    } catch (error: any) {
      if (this.currentTest) {
        this.currentTest.status = 'error';
        this.currentTest.error = error.message;
      }
    } finally {
      this.isRunningTest = false;
    }
  }

  private async getBaseSchema(): Promise<any> {
    const formValue = this.testForm.value;

    if (formValue.baseSource === 'registry') {
      const version = await this.schemaRegistry.getSchemaVersion(
        formValue.subjectName,
        formValue.baseVersion
      ).toPromise();
      return JSON.parse(version!.schema);
    } else {
      return JSON.parse(formValue.baseSchema);
    }
  }

  retryTest(): void {
    if (this.currentTest) {
      this.runCompatibilityTest();
    }
  }

  resetForm(): void {
    this.testForm.reset({
      baseSource: 'manual',
      compatibilityMode: 'BACKWARD'
    });
    this.currentTest = null;
    this.baseSchemaValid = null;
    this.candidateSchemaValid = null;
    this.availableVersions = [];
    this.subjectSuggestions = [];
  }

  // Results methods
  getStatusText(): string {
    if (!this.currentTest) return '';

    switch (this.currentTest.status) {
      case 'running': return 'Running analysis...';
      case 'completed': return 'Analysis complete';
      case 'error': return 'Analysis failed';
      default: return 'Pending';
    }
  }

  getCompatibilityMessage(): string {
    if (!this.currentTest?.analysis) return '';

    const { isBackwardCompatible, changes } = this.currentTest.analysis;
    const breakingCount = changes.filter(c => c.breaking).length;

    if (isBackwardCompatible) {
      return `Schema is ${this.currentTest.compatibilityMode.toLowerCase()} compatible. All changes are non-breaking.`;
    } else {
      return `Schema is not ${this.currentTest.compatibilityMode.toLowerCase()} compatible. Found ${breakingCount} breaking change${breakingCount !== 1 ? 's' : ''}.`;
    }
  }

  getBreakingChanges(): SchemaChange[] {
    return this.currentTest?.analysis?.changes.filter(c => c.breaking) || [];
  }

  getWarningChanges(): SchemaChange[] {
    return this.currentTest?.analysis?.changes.filter(c => !c.breaking && c.impact !== 'LOW') || [];
  }

  getRiskLevel(): string {
    const breakingCount = this.getBreakingChanges().length;
    const warningCount = this.getWarningChanges().length;

    if (breakingCount > 0) return 'HIGH';
    if (warningCount > 2) return 'MEDIUM';
    return 'LOW';
  }

  getRiskIcon(): string {
    switch (this.getRiskLevel()) {
      case 'HIGH': return '🔴';
      case 'MEDIUM': return '🟡';
      default: return '🟢';
    }
  }

  applyResultsFilter(): void {
    if (!this.currentTest?.analysis) return;

    const allChanges = this.currentTest.analysis.changes;

    switch (this.resultsFilter) {
      case 'breaking':
        this.filteredResults = allChanges.filter(c => c.breaking);
        break;
      case 'warnings':
        this.filteredResults = allChanges.filter(c => !c.breaking && c.impact !== 'LOW');
        break;
      case 'safe':
        this.filteredResults = allChanges.filter(c => !c.breaking && c.impact === 'LOW');
        break;
      default:
        this.filteredResults = [...allChanges];
    }
  }

  getFilteredResults(): SchemaChange[] {
    return this.filteredResults;
  }

  isWarningChange(change: SchemaChange): boolean {
    return !change.breaking && change.impact !== 'LOW';
  }

  getMitigationAdvice(change: SchemaChange): string | null {
    // Provide contextual advice based on change type
    const changeType = change.type as string;
    switch (changeType) {
      case 'FIELD_REMOVED':
        return 'Consider making the field optional first, then remove in a future version.';
      case 'REQUIRED_ADDED':
        return 'Provide default values for new required fields or make them optional initially.';
      case 'FIELD_TYPE_CHANGED':
        return 'Use union types or gradual migration to avoid breaking existing consumers.';
      case 'CONSTRAINT_ADDED':
        return 'Ensure existing data complies with new constraints before deployment.';
      case 'CONSTRAINT_REMOVED':
        return 'Validate that removing constraints won\'t affect data integrity.';
      default:
        return null;
    }
  }

  formatChangeValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  exportResults(format: 'json' | 'report'): void {
    if (!this.currentTest?.analysis) return;

    const timestamp = new Date().toISOString();
    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify({
        test: {
          name: this.currentTest.name,
          description: this.currentTest.description,
          compatibilityMode: this.currentTest.compatibilityMode,
          timestamp: this.currentTest.createdAt.toISOString()
        },
        result: {
          isCompatible: this.currentTest.analysis.isBackwardCompatible,
          riskLevel: this.getRiskLevel(),
          totalChanges: this.currentTest.analysis.changes.length,
          breakingChanges: this.getBreakingChanges().length
        },
        changes: this.currentTest.analysis.changes,
        migrationPath: this.currentTest.analysis.migrationPath
      }, null, 2);
      filename = `compatibility-test-${timestamp.split('T')[0]}.json`;
      mimeType = 'application/json';
    } else {
      // Generate text report
      const breaking = this.getBreakingChanges();
      const warnings = this.getWarningChanges();
      
      content = `Schema Compatibility Test Report
Generated: ${timestamp}

Test Details:
- Name: ${this.currentTest.name}
- Mode: ${this.currentTest.compatibilityMode}
- Result: ${this.currentTest.analysis.isBackwardCompatible ? 'COMPATIBLE' : 'INCOMPATIBLE'}
- Risk Level: ${this.getRiskLevel()}

Summary:
- Total Changes: ${this.currentTest.analysis.changes.length}
- Breaking Changes: ${breaking.length}
- Warnings: ${warnings.length}

${breaking.length > 0 ? `
Breaking Changes:
${breaking.map((c, i) => `${i + 1}. ${c.description} (${c.field || 'root'})`).join('\n')}
` : ''}

${warnings.length > 0 ? `
Warnings:
${warnings.map((c, i) => `${i + 1}. ${c.description} (${c.field || 'root'})`).join('\n')}
` : ''}

${this.currentTest.analysis.migrationPath.length > 0 ? `
Migration Path:
${this.currentTest.analysis.migrationPath.map((step, i) => `${i + 1}. ${step.action}: ${step.description}`).join('\n')}
` : ''}
`;
      filename = `compatibility-report-${timestamp.split('T')[0]}.txt`;
      mimeType = 'text/plain';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    window.URL.revokeObjectURL(url);
  }

  shareResults(): void {
    // Implementation for sharing results (could be a URL with encoded test data)
    const testData = {
      name: this.currentTest?.name,
      mode: this.currentTest?.compatibilityMode,
      compatible: this.currentTest?.analysis?.isBackwardCompatible,
      changes: this.currentTest?.analysis?.changes.length
    };
    
    const encoded = btoa(JSON.stringify(testData));
    const url = `${window.location.origin}${window.location.pathname}?test=${encoded}`;
    
    navigator.clipboard.writeText(url).then(() => {
      alert('Test results link copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy link to clipboard');
    });
  }

  // History methods
  private loadTestHistory(): void {
    const stored = localStorage.getItem('compatibility-test-history');
    if (stored) {
      try {
        this.testHistory = JSON.parse(stored).map((test: any) => ({
          ...test,
          createdAt: new Date(test.createdAt)
        }));
        this.filteredHistory = [...this.testHistory];
      } catch (error) {
        console.error('Error loading test history:', error);
        this.testHistory = [];
      }
    }
  }

  private addToHistory(test: CompatibilityTest): void {
    this.testHistory.unshift(test);
    
    // Keep only last 50 tests
    if (this.testHistory.length > 50) {
      this.testHistory = this.testHistory.slice(0, 50);
    }

    this.saveTestHistory();
    this.filterHistory();
  }

  private saveTestHistory(): void {
    try {
      localStorage.setItem('compatibility-test-history', JSON.stringify(this.testHistory));
    } catch (error) {
      console.error('Error saving test history:', error);
    }
  }

  filterHistory(): void {
    const term = this.historySearchTerm.toLowerCase();
    this.filteredHistory = this.testHistory.filter(test =>
      test.name.toLowerCase().includes(term) ||
      (test.description && test.description.toLowerCase().includes(term)) ||
      (test.subjectName && test.subjectName.toLowerCase().includes(term))
    );
  }

  loadTest(test: CompatibilityTest): void {
    this.currentTest = test;
    this.filteredResults = test.analysis?.changes || [];
    this.resultsFilter = '';
  }

  clearHistory(): void {
    if (confirm('Are you sure you want to clear all test history?')) {
      this.testHistory = [];
      this.filteredHistory = [];
      localStorage.removeItem('compatibility-test-history');
    }
  }

  trackByChange(index: number, change: SchemaChange): string {
    return `${change.type}-${change.field}-${index}`;
  }

  trackByTest(index: number, test: CompatibilityTest): string {
    return test.id;
  }

  private generateTestId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}