import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject as RxSubject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { SchemaRegistryService } from '../../services/registry/schema-registry.service';
import { JsonSchemaCompatibilityService } from '../../services/registry/compatibility.service';
import { SchemaBuilderService } from '../../services/schema-builder.service';
import { 
  SchemaVersion, 
  EvolutionAnalysis,
  SchemaChange,
  CompatibilityLevel,
  PublishConfig,
  MigrationStep
} from '../../models/schema-registry.models';
import { JsonSchema } from '../../models/schema.models';

interface WizardStep {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  valid: boolean;
}

interface EvolutionContext {
  subjectName: string;
  baseVersion: SchemaVersion;
  newSchema: JsonSchema;
  evolutionAnalysis: EvolutionAnalysis | null;
  compatibilityLevel: CompatibilityLevel;
  publishConfig: PublishConfig;
}

@Component({
  selector: 'app-schema-evolution-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="evolution-wizard">
      <div class="wizard-header">
        <div class="breadcrumb">
          <button class="back-btn" (click)="goBack()">← Back</button>
          <span class="separator">/</span>
          <span class="current-page">Schema Evolution Wizard</span>
        </div>
        
        <div class="wizard-title">
          <h1>Evolve Schema: {{ context.subjectName }}</h1>
          <div class="base-version" *ngIf="context.baseVersion">
            From version {{ context.baseVersion.version }}
          </div>
        </div>
      </div>

      <!-- Wizard Progress -->
      <div class="wizard-progress">
        <div 
          *ngFor="let step of steps; let i = index"
          class="progress-step"
          [class.active]="currentStep === i"
          [class.completed]="step.completed"
          [class.invalid]="!step.valid && currentStep > i"
        >
          <div class="step-number">
            <span *ngIf="step.completed">✓</span>
            <span *ngIf="!step.completed">{{ i + 1 }}</span>
          </div>
          <div class="step-info">
            <div class="step-title">{{ step.title }}</div>
            <div class="step-description">{{ step.description }}</div>
          </div>
        </div>
      </div>

      <!-- Wizard Content -->
      <div class="wizard-content" *ngIf="!loading && !error">
        
        <!-- Step 1: Select Base Schema -->
        <div class="wizard-step" *ngIf="currentStep === 0">
          <h2>Step 1: Select Base Schema</h2>
          <p>Choose the schema version you want to evolve from.</p>
          
          <div class="base-selection">
            <div class="current-base" *ngIf="context.baseVersion">
              <h3>Selected Base Version</h3>
              <div class="version-card">
                <div class="version-info">
                  <span class="version-number">v{{ context.baseVersion.version }}</span>
                  <span class="version-id">ID: {{ context.baseVersion.id }}</span>
                  <span class="schema-type">{{ context.baseVersion.schemaType }}</span>
                </div>
                <button class="change-btn" (click)="showVersionSelector = true">Change</button>
              </div>
              
              <div class="schema-preview">
                <h4>Current Schema</h4>
                <pre class="schema-code">{{ formatSchema(context.baseVersion.schema) }}</pre>
              </div>
            </div>
            
            <div class="version-selector" *ngIf="showVersionSelector">
              <h3>Available Versions</h3>
              <div class="versions-list">
                <div 
                  *ngFor="let version of availableVersions"
                  class="version-option"
                  [class.selected]="version.version === context.baseVersion.version"
                  (click)="selectBaseVersion(version)"
                >
                  <div class="version-header">
                    <span class="version-number">v{{ version.version }}</span>
                    <span class="version-date" *ngIf="version.createdAt">
                      {{ version.createdAt | date:'short' }}
                    </span>
                  </div>
                  <div class="version-id">ID: {{ version.id }}</div>
                </div>
              </div>
              <button class="cancel-btn" (click)="showVersionSelector = false">Cancel</button>
            </div>
          </div>
        </div>

        <!-- Step 2: Edit Schema -->
        <div class="wizard-step" *ngIf="currentStep === 1">
          <h2>Step 2: Edit Schema</h2>
          <p>Make your changes to the schema. The system will analyze compatibility as you edit.</p>
          
          <div class="schema-editor">
            <div class="editor-controls">
              <button class="control-btn" (click)="loadSchemaInEditor()">
                Load in Visual Editor
              </button>
              <button class="control-btn" (click)="importFromFile()">
                Import from File
              </button>
              <button class="control-btn" (click)="resetToBase()">
                Reset to Base
              </button>
            </div>
            
            <div class="editor-content">
              <div class="json-editor">
                <h4>Edit Schema JSON</h4>
                <textarea 
                  class="schema-textarea"
                  [(ngModel)]="schemaJson"
                  (ngModelChange)="onSchemaChange()"
                  placeholder="Enter your JSON schema here..."
                ></textarea>
                <div class="json-validation" *ngIf="jsonError" class="error">
                  Invalid JSON: {{ jsonError }}
                </div>
              </div>
              
              <div class="preview-panel">
                <h4>Schema Preview</h4>
                <pre class="schema-preview">{{ formatSchema(schemaJson) }}</pre>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 3: Compatibility Analysis -->
        <div class="wizard-step" *ngIf="currentStep === 2">
          <h2>Step 3: Compatibility Analysis</h2>
          <p>Review the changes and compatibility analysis before publishing.</p>
          
          <div class="analysis-results" *ngIf="context.evolutionAnalysis">
            <div class="compatibility-overview">
              <div class="compatibility-status">
                <div 
                  class="status-indicator"
                  [class.compatible]="context.evolutionAnalysis.isBackwardCompatible"
                  [class.incompatible]="!context.evolutionAnalysis.isBackwardCompatible"
                >
                  <span class="status-icon">
                    {{ context.evolutionAnalysis.isBackwardCompatible ? '✓' : '⚠️' }}
                  </span>
                  <span class="status-text">
                    {{ context.evolutionAnalysis.isBackwardCompatible ? 'Backward Compatible' : 'Breaking Changes Detected' }}
                  </span>
                </div>
                
                <div class="changes-summary">
                  <span class="change-count breaking" *ngIf="getBreakingChangesCount() > 0">
                    {{ getBreakingChangesCount() }} Breaking
                  </span>
                  <span class="change-count non-breaking">
                    {{ getNonBreakingChangesCount() }} Non-Breaking
                  </span>
                  <span class="change-count total">
                    {{ context.evolutionAnalysis.changes.length }} Total Changes
                  </span>
                </div>
              </div>
            </div>

            <div class="changes-details">
              <h3>Detected Changes</h3>
              <div class="changes-list">
                <div 
                  *ngFor="let change of context.evolutionAnalysis.changes"
                  class="change-item"
                  [class.breaking]="change.breaking"
                >
                  <div class="change-header">
                    <span class="change-type">{{ change.type }}</span>
                    <span class="change-impact" [attr.data-impact]="change.impact">
                      {{ change.impact }}
                    </span>
                    <span class="breaking-indicator" *ngIf="change.breaking">Breaking</span>
                  </div>
                  <div class="change-description">{{ change.description }}</div>
                  <div class="change-field" *ngIf="change.field">
                    Field: <code>{{ change.field }}</code>
                  </div>
                </div>
              </div>
            </div>

            <div class="migration-guidance" *ngIf="context.evolutionAnalysis.migrationPath.length > 0">
              <h3>Migration Guidance</h3>
              <div class="migration-steps">
                <div 
                  *ngFor="let step of context.evolutionAnalysis.migrationPath"
                  class="migration-step"
                >
                  <div class="step-action">{{ step.action }}</div>
                  <div class="step-description">{{ step.description }}</div>
                  <pre class="step-code" *ngIf="step.code">{{ step.code }}</pre>
                </div>
              </div>
            </div>

            <div class="risk-assessment" *ngIf="context.evolutionAnalysis.riskAssessment">
              <h3>Risk Assessment</h3>
              <div 
                class="risk-level"
                [attr.data-risk]="context.evolutionAnalysis.riskAssessment.overallRisk"
              >
                <span class="risk-indicator">{{ getRiskIcon(context.evolutionAnalysis.riskAssessment.overallRisk) }}</span>
                <span class="risk-text">{{ context.evolutionAnalysis.riskAssessment.overallRisk }} Risk</span>
              </div>
              <div class="risk-factors">
                <div *ngFor="let action of context.evolutionAnalysis.riskAssessment.recommendedActions" class="risk-factor">
                  {{ action }}
                </div>
              </div>
            </div>
          </div>

          <div class="no-analysis" *ngIf="!context.evolutionAnalysis">
            <p>No changes detected or analysis not available.</p>
          </div>
        </div>

        <!-- Step 4: Publish Configuration -->
        <div class="wizard-step" *ngIf="currentStep === 3">
          <h2>Step 4: Publish Configuration</h2>
          <p>Configure the publishing options for your new schema version.</p>
          
          <div class="publish-config">
            <div class="config-section">
              <h3>Version Information</h3>
              <div class="form-group">
                <label for="subject">Subject Name:</label>
                <input 
                  type="text" 
                  id="subject"
                  [(ngModel)]="context.publishConfig.subject"
                  readonly
                  class="readonly-input"
                >
              </div>
              
              <div class="form-group">
                <label for="version-type">Version Type:</label>
                <select id="version-type" [(ngModel)]="versionType" (change)="updateVersionNumber()">
                  <option value="patch">Patch (Non-breaking)</option>
                  <option value="minor">Minor (Backward compatible)</option>
                  <option value="major">Major (Breaking changes)</option>
                </select>
              </div>
              
              <div class="form-group">
                <label for="next-version">Next Version:</label>
                <input 
                  type="number" 
                  id="next-version"
                  [(ngModel)]="nextVersion"
                  readonly
                  class="readonly-input"
                >
              </div>
            </div>

            <div class="config-section">
              <h3>Compatibility Settings</h3>
              <div class="form-group">
                <label for="compatibility">Compatibility Level:</label>
                <select id="compatibility" [(ngModel)]="context.compatibilityLevel">
                  <option value="BACKWARD">Backward Compatible</option>
                  <option value="FORWARD">Forward Compatible</option>
                  <option value="FULL">Full Compatible</option>
                  <option value="NONE">No Compatibility</option>
                </select>
              </div>
              
              <div class="compatibility-warning" *ngIf="hasCompatibilityWarning()">
                <span class="warning-icon">⚠️</span>
                {{ getCompatibilityWarning() }}
              </div>
            </div>

            <div class="config-section">
              <h3>Additional Options</h3>
              <div class="checkbox-group">
                <label>
                  <input type="checkbox" [(ngModel)]="validateCompatibility">
                  Validate compatibility before publishing
                </label>
              </div>
              <div class="checkbox-group">
                <label>
                  <input type="checkbox" [(ngModel)]="createBackup">
                  Create backup of previous version
                </label>
              </div>
            </div>
          </div>
        </div>

        <!-- Step 5: Review and Publish -->
        <div class="wizard-step" *ngIf="currentStep === 4">
          <h2>Step 5: Review and Publish</h2>
          <p>Review all settings and publish your new schema version.</p>
          
          <div class="publish-review">
            <div class="review-section">
              <h3>Evolution Summary</h3>
              <div class="summary-grid">
                <div class="summary-item">
                  <span class="label">Subject:</span>
                  <span class="value">{{ context.subjectName }}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Base Version:</span>
                  <span class="value">v{{ context.baseVersion.version }}</span>
                </div>
                <div class="summary-item">
                  <span class="label">New Version:</span>
                  <span class="value">v{{ nextVersion }}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Compatibility:</span>
                  <span class="value">{{ context.compatibilityLevel }}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Changes:</span>
                  <span class="value">{{ (context.evolutionAnalysis?.changes || []).length }}</span>
                </div>
                <div class="summary-item">
                  <span class="label">Breaking:</span>
                  <span class="value">{{ getBreakingChangesCount() }}</span>
                </div>
              </div>
            </div>

            <div class="review-section">
              <h3>Final Schema</h3>
              <pre class="final-schema">{{ formatSchema(schemaJson) }}</pre>
            </div>

            <div class="publish-actions">
              <button 
                class="publish-btn primary"
                (click)="publishSchema()"
                [disabled]="publishing"
              >
                {{ publishing ? 'Publishing...' : 'Publish Schema' }}
              </button>
              <button class="publish-btn secondary" (click)="saveDraft()">
                Save as Draft
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Wizard Navigation -->
      <div class="wizard-navigation" *ngIf="!loading && !error">
        <button 
          class="nav-btn secondary"
          (click)="previousStep()"
          [disabled]="currentStep === 0"
        >
          Previous
        </button>
        
        <div class="step-indicator">
          Step {{ currentStep + 1 }} of {{ steps.length }}
        </div>
        
        <button 
          class="nav-btn primary"
          (click)="nextStep()"
          [disabled]="!canProceed()"
        >
          {{ currentStep === steps.length - 1 ? 'Review' : 'Next' }}
        </button>
      </div>

      <!-- Loading State -->
      <div class="loading-state" *ngIf="loading">
        <div class="spinner"></div>
        <p>Loading evolution wizard...</p>
      </div>

      <!-- Error State -->
      <div class="error-state" *ngIf="error">
        <div class="error-icon">⚠️</div>
        <h3>Error</h3>
        <p>{{ error }}</p>
        <button class="retry-btn" (click)="initialize()">Retry</button>
      </div>

      <!-- Success Modal -->
      <div class="success-modal" *ngIf="publishSuccess" (click)="closeSuccessModal()">
        <div class="modal-content" (click)="$event.stopPropagation()">
          <div class="success-header">
            <span class="success-icon">✅</span>
            <h3>Schema Published Successfully!</h3>
          </div>
          <div class="success-details">
            <p>Your schema has been successfully registered with ID: <strong>{{ publishResult?.schemaId }}</strong></p>
            <p>Version: <strong>{{ nextVersion }}</strong></p>
          </div>
          <div class="success-actions">
            <button class="action-btn primary" (click)="viewPublishedSchema()">
              View Schema
            </button>
            <button class="action-btn secondary" (click)="closeSuccessModal()">
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .evolution-wizard {
      padding: 20px;
      height: 100vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .wizard-header {
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

    .wizard-title h1 {
      margin: 0;
      color: #333;
    }

    .base-version {
      color: #666;
      font-size: 14px;
    }

    .wizard-progress {
      display: flex;
      justify-content: space-between;
      margin-bottom: 32px;
      padding: 20px;
      background: #f8f9fa;
      border-radius: 8px;
    }

    .progress-step {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      flex: 1;
      position: relative;
    }

    .progress-step:not(:last-child)::after {
      content: '';
      position: absolute;
      top: 15px;
      right: -50%;
      width: 100%;
      height: 2px;
      background: #e0e0e0;
    }

    .progress-step.active::after,
    .progress-step.completed::after {
      background: #2196f3;
    }

    .step-number {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #e0e0e0;
      color: #666;
      font-weight: bold;
      font-size: 14px;
      margin-bottom: 8px;
      position: relative;
      z-index: 1;
    }

    .progress-step.active .step-number {
      background: #2196f3;
      color: white;
    }

    .progress-step.completed .step-number {
      background: #4caf50;
      color: white;
    }

    .progress-step.invalid .step-number {
      background: #f44336;
      color: white;
    }

    .step-info {
      max-width: 120px;
    }

    .step-title {
      font-weight: bold;
      font-size: 12px;
      color: #333;
      margin-bottom: 4px;
    }

    .step-description {
      font-size: 11px;
      color: #666;
      line-height: 1.3;
    }

    .wizard-content {
      flex: 1;
      margin-bottom: 24px;
    }

    .wizard-step {
      background: white;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      padding: 24px;
    }

    .wizard-step h2 {
      margin: 0 0 8px 0;
      color: #333;
    }

    .wizard-step p {
      margin: 0 0 24px 0;
      color: #666;
    }

    /* Step-specific styles */
    .version-card {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      margin-bottom: 16px;
    }

    .version-info {
      display: flex;
      gap: 16px;
      align-items: center;
    }

    .version-number {
      font-weight: bold;
      color: #2196f3;
    }

    .version-id, .schema-type {
      font-size: 12px;
      color: #666;
    }

    .change-btn {
      padding: 6px 12px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
    }

    .schema-preview {
      margin-top: 16px;
    }

    .schema-preview h4 {
      margin: 0 0 8px 0;
      color: #333;
    }

    .schema-code, .schema-preview pre, .final-schema {
      background: #f8f8f8;
      padding: 16px;
      border-radius: 4px;
      border: 1px solid #e0e0e0;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      overflow-x: auto;
      max-height: 300px;
      overflow-y: auto;
    }

    .versions-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 16px;
    }

    .version-option {
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .version-option:hover {
      border-color: #2196f3;
    }

    .version-option.selected {
      background: #e3f2fd;
      border-color: #2196f3;
    }

    .version-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 4px;
    }

    .version-date {
      font-size: 12px;
      color: #666;
    }

    .cancel-btn {
      padding: 8px 16px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
    }

    .schema-editor {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .editor-controls {
      display: flex;
      gap: 12px;
    }

    .control-btn {
      padding: 8px 16px;
      background: #f5f5f5;
      border: 1px solid #ddd;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
    }

    .editor-content {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    .json-editor h4, .preview-panel h4 {
      margin: 0 0 8px 0;
      color: #333;
    }

    .schema-textarea {
      width: 100%;
      height: 400px;
      font-family: 'Courier New', monospace;
      font-size: 12px;
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
      resize: vertical;
    }

    .json-validation.error {
      color: #f44336;
      font-size: 12px;
      margin-top: 8px;
    }

    .compatibility-overview {
      background: #f8f9fa;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 24px;
    }

    .status-indicator {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .status-indicator.compatible {
      color: #4caf50;
    }

    .status-indicator.incompatible {
      color: #f44336;
    }

    .status-icon {
      font-size: 20px;
    }

    .status-text {
      font-weight: bold;
      font-size: 16px;
    }

    .changes-summary {
      display: flex;
      gap: 12px;
    }

    .change-count {
      padding: 4px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: bold;
    }

    .change-count.breaking {
      background: #ffeaea;
      color: #d32f2f;
    }

    .change-count.non-breaking {
      background: #e8f5e8;
      color: #388e3c;
    }

    .change-count.total {
      background: #e3f2fd;
      color: #1976d2;
    }

    .changes-details h3 {
      margin: 0 0 16px 0;
      color: #333;
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
      background: white;
    }

    .change-item.breaking {
      border-color: #f44336;
      background: #ffeaea;
    }

    .change-header {
      display: flex;
      gap: 12px;
      align-items: center;
      margin-bottom: 8px;
    }

    .change-type {
      font-weight: bold;
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

    .breaking-indicator {
      background: #f44336;
      color: white;
      padding: 2px 6px;
      border-radius: 8px;
      font-size: 10px;
      font-weight: bold;
    }

    .change-description {
      color: #333;
      margin-bottom: 4px;
    }

    .change-field {
      font-size: 12px;
      color: #666;
    }

    .change-field code {
      background: #f5f5f5;
      padding: 2px 4px;
      border-radius: 4px;
      font-family: 'Courier New', monospace;
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

    .step-action {
      font-weight: bold;
      color: #2196f3;
      margin-bottom: 4px;
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
    }

    .risk-level {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
    }

    .risk-level[data-risk="LOW"] { color: #4caf50; }
    .risk-level[data-risk="MEDIUM"] { color: #ff9800; }
    .risk-level[data-risk="HIGH"] { color: #f44336; }
    .risk-level[data-risk="CRITICAL"] { color: #d32f2f; }

    .risk-indicator {
      font-size: 18px;
    }

    .risk-text {
      font-weight: bold;
    }

    .risk-factors {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .risk-factor {
      font-size: 14px;
      color: #666;
    }

    .publish-config {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .config-section h3 {
      margin: 0 0 16px 0;
      color: #333;
    }

    .form-group {
      display: flex;
      flex-direction: column;
      gap: 4px;
      margin-bottom: 16px;
    }

    .form-group label {
      font-weight: bold;
      color: #333;
    }

    .form-group input, .form-group select {
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      font-size: 14px;
    }

    .readonly-input {
      background-color: #f5f5f5;
      cursor: not-allowed;
    }

    .compatibility-warning {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px;
      background: #fff3e0;
      border: 1px solid #ff9800;
      border-radius: 4px;
      color: #f57c00;
    }

    .warning-icon {
      font-size: 16px;
    }

    .checkbox-group {
      margin-bottom: 12px;
    }

    .checkbox-group label {
      display: flex;
      align-items: center;
      gap: 8px;
      cursor: pointer;
    }

    .publish-review {
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .summary-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .summary-item {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
    }

    .summary-item .label {
      font-weight: bold;
      color: #666;
    }

    .summary-item .value {
      color: #333;
    }

    .publish-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }

    .publish-btn {
      padding: 12px 24px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 16px;
      font-weight: bold;
    }

    .publish-btn.primary {
      background-color: #4caf50;
      color: white;
    }

    .publish-btn.secondary {
      background-color: #f5f5f5;
      color: #666;
      border: 1px solid #ddd;
    }

    .publish-btn:disabled {
      background-color: #ccc;
      color: #999;
      cursor: not-allowed;
    }

    .wizard-navigation {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 0;
      border-top: 1px solid #e0e0e0;
    }

    .nav-btn {
      padding: 10px 20px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      font-weight: bold;
    }

    .nav-btn.primary {
      background-color: #2196f3;
      color: white;
    }

    .nav-btn.secondary {
      background-color: #f5f5f5;
      color: #666;
      border: 1px solid #ddd;
    }

    .nav-btn:disabled {
      background-color: #ccc;
      color: #999;
      cursor: not-allowed;
    }

    .step-indicator {
      font-size: 14px;
      color: #666;
    }

    .success-modal {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
    }

    .modal-content {
      background: white;
      padding: 24px;
      border-radius: 8px;
      max-width: 400px;
      text-align: center;
    }

    .success-header {
      margin-bottom: 16px;
    }

    .success-icon {
      font-size: 48px;
      margin-bottom: 8px;
      display: block;
    }

    .success-header h3 {
      margin: 0;
      color: #333;
    }

    .success-details {
      margin-bottom: 24px;
      color: #666;
    }

    .success-actions {
      display: flex;
      gap: 12px;
      justify-content: center;
    }

    .action-btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-weight: bold;
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

    @media (max-width: 768px) {
      .wizard-progress {
        flex-direction: column;
        gap: 16px;
      }
      
      .progress-step::after {
        display: none;
      }
      
      .editor-content {
        grid-template-columns: 1fr;
      }
      
      .summary-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class SchemaEvolutionWizardComponent implements OnInit, OnDestroy {
  private destroy$ = new RxSubject<void>();

  // Wizard state
  steps: WizardStep[] = [
    { id: 0, title: 'Select Base', description: 'Choose base schema version', completed: false, valid: false },
    { id: 1, title: 'Edit Schema', description: 'Make schema modifications', completed: false, valid: false },
    { id: 2, title: 'Analyze', description: 'Review compatibility', completed: false, valid: false },
    { id: 3, title: 'Configure', description: 'Set publish options', completed: false, valid: false },
    { id: 4, title: 'Publish', description: 'Review and publish', completed: false, valid: false }
  ];

  currentStep = 0;
  loading = false;
  error: string | null = null;

  // Evolution context
  context: EvolutionContext = {
    subjectName: '',
    baseVersion: {} as SchemaVersion,
    newSchema: {} as JsonSchema,
    evolutionAnalysis: null,
    compatibilityLevel: 'BACKWARD',
    publishConfig: {} as PublishConfig
  };

  // Component state
  availableVersions: SchemaVersion[] = [];
  showVersionSelector = false;
  schemaJson = '';
  jsonError: string | null = null;
  versionType: 'patch' | 'minor' | 'major' = 'minor';
  nextVersion = 1;
  validateCompatibility = true;
  createBackup = true;
  publishing = false;
  publishSuccess = false;
  publishResult: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private schemaRegistry: SchemaRegistryService,
    private compatibilityService: JsonSchemaCompatibilityService,
    private schemaBuilder: SchemaBuilderService
  ) {}

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.context.subjectName = params['subjectName'];
        if (this.context.subjectName) {
          this.initialize();
        }
      });

    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        if (params['fromVersion']) {
          // Set specific version as base
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async initialize(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      // Load available versions
      const versionNumbers = await this.schemaRegistry.getSubjectVersions(this.context.subjectName).toPromise() || [];
      
      this.availableVersions = await Promise.all(
        versionNumbers.map(async (versionNum): Promise<SchemaVersion> => {
          const version = await this.schemaRegistry.getSchemaVersion(this.context.subjectName, versionNum).toPromise();
          return version!;
        })
      );

      // Sort by version number (descending - newest first)
      this.availableVersions.sort((a, b) => b.version - a.version);

      // Auto-select latest version as base
      if (this.availableVersions.length > 0) {
        this.selectBaseVersion(this.availableVersions[0]);
      }

      // Initialize publish config
      this.context.publishConfig = {
        subject: this.context.subjectName,
        schema: {} as JsonSchema,
        compatibilityLevel: this.context.compatibilityLevel,
        references: []
      };

    } catch (error: any) {
      this.error = error.message || 'Failed to initialize evolution wizard';
      console.error('Error initializing wizard:', error);
    } finally {
      this.loading = false;
    }
  }

  selectBaseVersion(version: SchemaVersion): void {
    this.context.baseVersion = version;
    this.schemaJson = this.formatSchema(version.schema);
    this.context.newSchema = JSON.parse(version.schema);
    this.showVersionSelector = false;
    this.steps[0].completed = true;
    this.steps[0].valid = true;
    this.validateStep(1);
  }

  formatSchema(schema: string): string {
    try {
      const parsed = JSON.parse(schema);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return schema;
    }
  }

  onSchemaChange(): void {
    try {
      this.context.newSchema = JSON.parse(this.schemaJson);
      this.jsonError = null;
      this.steps[1].valid = true;
      
      // Trigger compatibility analysis
      this.analyzeCompatibility();
      
    } catch (error: any) {
      this.jsonError = error.message;
      this.steps[1].valid = false;
      this.context.evolutionAnalysis = null;
    }
  }

  private async analyzeCompatibility(): Promise<void> {
    if (!this.context.baseVersion || !this.context.newSchema) return;

    try {
      const baseSchema = JSON.parse(this.context.baseVersion.schema);
      this.context.evolutionAnalysis = this.compatibilityService.analyzeEvolution(
        baseSchema, 
        this.context.newSchema
      );
      
      this.steps[2].completed = true;
      this.steps[2].valid = true;
      this.validateStep(3);
      
    } catch (error) {
      console.error('Error analyzing compatibility:', error);
      this.context.evolutionAnalysis = null;
    }
  }

  getBreakingChangesCount(): number {
    return this.context.evolutionAnalysis ? 
      this.context.evolutionAnalysis.changes.filter(c => c.breaking).length : 0;
  }

  getNonBreakingChangesCount(): number {
    return this.context.evolutionAnalysis ? 
      this.context.evolutionAnalysis.changes.filter(c => !c.breaking).length : 0;
  }

  getRiskIcon(level: string): string {
    const icons: { [key: string]: string } = {
      'LOW': '✅',
      'MEDIUM': '⚠️',
      'HIGH': '🚨',
      'CRITICAL': '🔥'
    };
    return icons[level] || '❓';
  }

  updateVersionNumber(): void {
    const currentVersion = this.context.baseVersion?.version || 1;
    switch (this.versionType) {
      case 'patch':
        this.nextVersion = currentVersion + 1;
        break;
      case 'minor':
        this.nextVersion = Math.ceil(currentVersion / 10) * 10 + 10;
        break;
      case 'major':
        this.nextVersion = Math.ceil(currentVersion / 100) * 100 + 100;
        break;
    }
    this.validateStep(4);
  }

  hasCompatibilityWarning(): boolean {
    return this.context.compatibilityLevel === 'BACKWARD' && this.getBreakingChangesCount() > 0;
  }

  getCompatibilityWarning(): string {
    if (this.hasCompatibilityWarning()) {
      return 'Warning: Breaking changes detected but BACKWARD compatibility is selected. This may cause compatibility issues.';
    }
    return '';
  }

  loadSchemaInEditor(): void {
    // Navigate to visual editor with current schema
    this.router.navigate(['/schema-editor'], {
      queryParams: {
        mode: 'evolve',
        subject: this.context.subjectName,
        returnTo: '/registry/evolve/' + this.context.subjectName
      }
    });
  }

  importFromFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event: any) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.schemaJson = e.target.result;
          this.onSchemaChange();
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  resetToBase(): void {
    if (this.context.baseVersion) {
      this.schemaJson = this.formatSchema(this.context.baseVersion.schema);
      this.onSchemaChange();
    }
  }

  async publishSchema(): Promise<void> {
    this.publishing = true;

    try {
      const publishConfig: PublishConfig = {
        subject: this.context.subjectName,
        schema: this.context.newSchema,
        compatibilityLevel: this.context.compatibilityLevel,
        references: []
      };

      this.publishResult = await this.schemaRegistry.registerJsonSchema(publishConfig).toPromise();
      this.publishSuccess = true;
      this.steps[4].completed = true;

    } catch (error: any) {
      console.error('Error publishing schema:', error);
      alert('Failed to publish schema: ' + (error.message || 'Unknown error'));
    } finally {
      this.publishing = false;
    }
  }

  saveDraft(): void {
    // Save current state to localStorage or backend
    const draft = {
      subjectName: this.context.subjectName,
      baseVersion: this.context.baseVersion.version,
      schema: this.schemaJson,
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(`schema_draft_${this.context.subjectName}`, JSON.stringify(draft));
    alert('Draft saved successfully!');
  }

  canProceed(): boolean {
    return this.steps[this.currentStep]?.valid || false;
  }

  nextStep(): void {
    if (this.canProceed() && this.currentStep < this.steps.length - 1) {
      this.steps[this.currentStep].completed = true;
      this.currentStep++;
      
      if (this.currentStep === 3) {
        this.updateVersionNumber();
      }
    }
  }

  previousStep(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  private validateStep(stepIndex: number): void {
    switch (stepIndex) {
      case 1:
        this.steps[1].valid = !!this.context.baseVersion.id;
        break;
      case 2:
        this.steps[2].valid = !this.jsonError && !!this.context.newSchema;
        break;
      case 3:
        this.steps[3].valid = !!this.context.evolutionAnalysis;
        break;
      case 4:
        this.steps[4].valid = true;
        break;
    }
  }

  goBack(): void {
    this.router.navigate(['/registry/subject', this.context.subjectName, 'details']);
  }

  closeSuccessModal(): void {
    this.publishSuccess = false;
    this.router.navigate(['/registry/subject', this.context.subjectName, 'details']);
  }

  viewPublishedSchema(): void {
    this.publishSuccess = false;
    this.router.navigate(['/registry/subject', this.context.subjectName, 'version', this.nextVersion]);
  }
}