import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, BehaviorSubject, combineLatest } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';

import { SchemaRegistryService } from '../../services/registry/schema-registry.service';
import { JsonSchemaCompatibilityService } from '../../services/registry/compatibility.service';
import { JsonSchemaEvolutionService } from '../../services/validation/json-schema-evolution.service';
import { NavigationService } from '../../services/navigation/navigation.service';

// import { FeatureGuideComponent } from '../shared/feature-guide.component';
import { 
  JsonSchema, 
  SchemaProperty, 
  PropertyType 
} from '../../models/schema.models';
import { 
  SchemaVersion,
  CompatibilityLevel,
  EvolutionAnalysis 
} from '../../models/schema-registry.models';

interface EditorMode {
  mode: 'create' | 'evolve' | 'import';
  title: string;
  description: string;
  icon: string;
}

interface SchemaTemplate {
  id: string;
  name: string;
  description: string;
  category: 'basic' | 'business' | 'technical' | 'event';
  schema: JsonSchema;
  tags: string[];
}

interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: string;
  route?: string;
  action?: () => void;
  disabled?: boolean;
}

@Component({
  selector: 'app-modern-schema-editor',
  standalone: true,
  imports: [
    CommonModule, 
    FormsModule, 
    ReactiveFormsModule
  ],
  template: `
    <div class="modern-editor">
      
      <!-- Editor Header -->
      <div class="editor-header">
        <div class="header-content">
          <div class="header-main">
            <h1 class="editor-title">
              <span class="title-icon">🏗️</span>
              Schema Registry Editor
            </h1>
            <p class="editor-subtitle">
              Create, evolve, and manage JSON Schemas for your Schema Registry
            </p>
          </div>
          
          <div class="header-actions">
            <button 
              class="action-btn registry-btn"
              (click)="navigateToRegistry()"
              title="Browse Registry"
            >
              <span class="btn-icon">📚</span>
              Registry
            </button>
            
            <button 
              class="action-btn evolution-btn"
              (click)="navigateToEvolution()"
              title="Evolution Tools"
            >
              <span class="btn-icon">🔄</span>
              Evolution
            </button>
          </div>
        </div>
      </div>

      <!-- Mode Selection -->
      <div class="mode-selection" *ngIf="!selectedMode">
        <div class="mode-grid">
          
          <div 
            *ngFor="let mode of availableModes"
            class="mode-card"
            (click)="selectMode(mode)"
            [class.recommended]="mode.mode === 'create'"
          >
            <div class="mode-icon">{{ mode.icon }}</div>
            <h3 class="mode-title">{{ mode.title }}</h3>
            <p class="mode-description">{{ mode.description }}</p>
            
            <div class="mode-features" *ngIf="mode.mode === 'create'">
              <span class="feature-tag">Templates</span>
              <span class="feature-tag">Validation</span>
              <span class="feature-tag">Registry Ready</span>
            </div>
            
            <div class="mode-features" *ngIf="mode.mode === 'evolve'">
              <span class="feature-tag">Evolution Analysis</span>
              <span class="feature-tag">Compatibility Check</span>
              <span class="feature-tag">Migration Path</span>
            </div>
            
            <div class="mode-features" *ngIf="mode.mode === 'import'">
              <span class="feature-tag">Registry Import</span>
              <span class="feature-tag">File Upload</span>
              <span class="feature-tag">URL Import</span>
            </div>

            <div class="mode-action">
              <span class="action-text">Get Started →</span>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="quick-actions-section">
          <h3 class="section-title">Quick Actions</h3>
          <div class="quick-actions-grid">
            <div 
              *ngFor="let action of quickActions"
              class="quick-action-card"
              (click)="executeQuickAction(action)"
              [class.disabled]="action.disabled"
            >
              <span class="action-icon">{{ action.icon }}</span>
              <div class="action-content">
                <h4 class="action-title">{{ action.title }}</h4>
                <p class="action-description">{{ action.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Create Mode -->
      <div class="create-mode" *ngIf="selectedMode?.mode === 'create'">
        <div class="mode-header">
          <button class="back-btn" (click)="goBackToModeSelection()">
            ← Back to Mode Selection
          </button>
          <h2 class="mode-title">Create New Schema</h2>
        </div>

        <!-- Template Selection -->
        <div class="template-section" *ngIf="!selectedTemplate">
          <h3 class="section-title">Choose a Template</h3>
          
          <!-- Template Categories -->
          <div class="template-categories">
            <button 
              *ngFor="let category of templateCategories"
              class="category-btn"
              [class.active]="selectedCategory === category.id"
              (click)="selectCategory(category.id)"
            >
              <span class="category-icon">{{ category.icon }}</span>
              {{ category.name }}
            </button>
          </div>

          <!-- Template Grid -->
          <div class="templates-grid">
            <div 
              *ngFor="let template of getFilteredTemplates()"
              class="template-card"
              (click)="selectTemplate(template)"
            >
              <div class="template-header">
                <h4 class="template-name">{{ template.name }}</h4>
                <div class="template-tags">
                  <span 
                    *ngFor="let tag of template.tags"
                    class="template-tag"
                  >
                    {{ tag }}
                  </span>
                </div>
              </div>
              
              <p class="template-description">{{ template.description }}</p>
              
              <div class="template-preview">
                <pre class="schema-preview">{{ getTemplatePreview(template) }}</pre>
              </div>
              
              <div class="template-action">
                <span class="action-text">Use Template →</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Schema Editor -->
        <div class="schema-editor-section" *ngIf="selectedTemplate">
          <div class="editor-toolbar">
            <button class="back-btn" (click)="goBackToTemplates()">
              ← Back to Templates
            </button>
            
            <div class="toolbar-info">
              <h3>Editing: {{ selectedTemplate.name }}</h3>
              <span class="template-category">{{ selectedTemplate.category }}</span>
            </div>
            
            <div class="toolbar-actions">
              <button 
                class="action-btn validate-btn"
                (click)="validateCurrentSchema()"
                [disabled]="isValidating"
              >
                <span class="btn-icon">✓</span>
                {{ isValidating ? 'Validating...' : 'Validate' }}
              </button>
              
              <button 
                class="action-btn preview-btn"
                (click)="togglePreview()"
              >
                <span class="btn-icon">👁️</span>
                {{ showPreview ? 'Hide' : 'Show' }} Preview
              </button>
              
              <button 
                class="action-btn primary publish-btn"
                (click)="publishToRegistry()"
                [disabled]="!canPublish()"
              >
                <span class="btn-icon">🚀</span>
                Publish to Registry
              </button>
            </div>
          </div>

          <div class="editor-workspace">
            <!-- Schema Form -->
            <div class="schema-form-panel" [formGroup]="schemaForm">
              <div class="form-section">
                <h4 class="section-title">Schema Information</h4>
                
                <div class="form-group">
                  <label for="subjectName">Subject Name *</label>
                  <input 
                    type="text"
                    id="subjectName"
                    formControlName="subjectName"
                    placeholder="e.g., user-profile, order-event"
                    class="form-control"
                  >
                  <div class="field-help">
                    Subject name in the Schema Registry (will be used for versioning)
                  </div>
                </div>

                <div class="form-group">
                  <label for="title">Schema Title *</label>
                  <input 
                    type="text"
                    id="title"
                    formControlName="title"
                    placeholder="Human-readable title"
                    class="form-control"
                  >
                </div>

                <div class="form-group">
                  <label for="description">Description</label>
                  <textarea 
                    id="description"
                    formControlName="description"
                    placeholder="Describe what this schema represents"
                    class="form-control"
                    rows="3"
                  ></textarea>
                </div>

                <div class="form-group">
                  <label for="version">Schema Version</label>
                  <input 
                    type="text"
                    id="version"
                    formControlName="version"
                    placeholder="1.0.0"
                    class="form-control"
                  >
                  <div class="field-help">
                    Semantic version for your schema
                  </div>
                </div>
              </div>

              <div class="form-section">
                <h4 class="section-title">Registry Configuration</h4>
                
                <div class="form-group">
                  <label for="compatibilityLevel">Compatibility Level</label>
                  <select 
                    id="compatibilityLevel"
                    formControlName="compatibilityLevel"
                    class="form-control"
                  >
                    <option value="BACKWARD">Backward - New schema can read old data</option>
                    <option value="FORWARD">Forward - Old schema can read new data</option>
                    <option value="FULL">Full - Both backward and forward compatible</option>
                    <option value="NONE">None - No compatibility requirements</option>
                  </select>
                </div>

                <div class="form-group">
                  <label>
                    <input 
                      type="checkbox"
                      formControlName="enableValidation"
                    >
                    Enable schema validation
                  </label>
                </div>

                <div class="form-group">
                  <label>
                    <input 
                      type="checkbox"
                      formControlName="generateDocumentation"
                    >
                    Generate documentation
                  </label>
                </div>
              </div>
            </div>

            <!-- Schema JSON Editor -->
            <div class="json-editor-panel">
              <div class="editor-header">
                <h4>Schema Definition</h4>
                <div class="editor-actions">
                  <button class="editor-btn" (click)="formatJSON()">Format</button>
                  <button class="editor-btn" (click)="addProperty()">+ Property</button>
                </div>
              </div>
              
              <div class="json-editor">
                <textarea
                  class="json-textarea"
                  [(ngModel)]="schemaJSON"
                  (ngModelChange)="onSchemaChange($event)"
                  placeholder="Your JSON Schema will appear here..."
                  spellcheck="false"
                ></textarea>
              </div>

              <!-- Validation Results -->
              <div class="validation-panel" *ngIf="validationResult">
                <div class="validation-header">
                  <h5 class="validation-title">
                    <span class="status-icon" [class.valid]="validationResult.isValid" [class.invalid]="!validationResult.isValid">
                      {{ validationResult.isValid ? '✅' : '❌' }}
                    </span>
                    Validation {{ validationResult.isValid ? 'Passed' : 'Failed' }}
                  </h5>
                </div>
                
                <div class="validation-content" *ngIf="!validationResult.isValid">
                  <div class="validation-errors">
                    <div 
                      *ngFor="let error of validationResult.errors"
                      class="validation-item error"
                    >
                      <strong>{{ error.path }}:</strong> {{ error.message }}
                      <div class="suggestion" *ngIf="error.suggestion">
                        💡 {{ error.suggestion }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Preview Panel -->
            <div class="preview-panel" *ngIf="showPreview">
              <div class="preview-header">
                <h4>Schema Preview</h4>
                <button class="close-btn" (click)="showPreview = false">×</button>
              </div>
              
              <div class="preview-content">
                <div class="preview-tabs">
                  <button 
                    class="tab-btn"
                    [class.active]="previewTab === 'formatted'"
                    (click)="previewTab = 'formatted'"
                  >
                    Formatted
                  </button>
                  <button 
                    class="tab-btn"
                    [class.active]="previewTab === 'example'"
                    (click)="previewTab = 'example'"
                  >
                    Example Data
                  </button>
                </div>
                
                <div class="preview-body">
                  <pre *ngIf="previewTab === 'formatted'" class="formatted-preview">{{ getFormattedSchema() }}</pre>
                  <pre *ngIf="previewTab === 'example'" class="example-preview">{{ getExampleData() }}</pre>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Evolve Mode -->
      <div class="evolve-mode" *ngIf="selectedMode?.mode === 'evolve'">
        <div class="mode-header">
          <button class="back-btn" (click)="goBackToModeSelection()">
            ← Back to Mode Selection
          </button>
          <h2 class="mode-title">Evolve Existing Schema</h2>
        </div>

        <!-- Evolution Workflow -->
        <div class="evolution-workflow">
          <div class="workflow-steps">
            <div 
              *ngFor="let step of evolutionSteps; let i = index"
              class="workflow-step"
              [class.active]="currentEvolutionStep === i"
              [class.completed]="currentEvolutionStep > i"
            >
              <div class="step-number">{{ i + 1 }}</div>
              <div class="step-content">
                <h4 class="step-title">{{ step.title }}</h4>
                <p class="step-description">{{ step.description }}</p>
              </div>
            </div>
          </div>

          <div class="workflow-actions">
            <button 
              class="action-btn evolution-wizard-btn"
              (click)="startEvolutionWizard()"
            >
              <span class="btn-icon">🧙‍♂️</span>
              Start Evolution Wizard
            </button>
            
            <button 
              class="action-btn compatibility-btn"
              (click)="openCompatibilityChecker()"
            >
              <span class="btn-icon">🔍</span>
              Check Compatibility
            </button>
          </div>
        </div>
      </div>

      <!-- Import Mode -->
      <div class="import-mode" *ngIf="selectedMode?.mode === 'import'">
        <div class="mode-header">
          <button class="back-btn" (click)="goBackToModeSelection()">
            ← Back to Mode Selection
          </button>
          <h2 class="mode-title">Import Schema</h2>
        </div>

        <!-- Import Options -->
        <div class="import-options">
          <div class="import-method-grid">
            
            <div class="import-method" (click)="selectImportMethod('registry')">
              <div class="method-icon">📚</div>
              <h3 class="method-title">From Registry</h3>
              <p class="method-description">
                Import an existing schema from the Schema Registry for editing or evolution
              </p>
            </div>

            <div class="import-method" (click)="selectImportMethod('file')">
              <div class="method-icon">📄</div>
              <h3 class="method-title">From File</h3>
              <p class="method-description">
                Upload a JSON Schema file from your computer
              </p>
            </div>

            <div class="import-method" (click)="selectImportMethod('url')">
              <div class="method-icon">🌐</div>
              <h3 class="method-title">From URL</h3>
              <p class="method-description">
                Import a schema from a public URL or API endpoint
              </p>
            </div>

            <div class="import-method" (click)="selectImportMethod('paste')">
              <div class="method-icon">📋</div>
              <h3 class="method-title">Paste JSON</h3>
              <p class="method-description">
                Paste JSON Schema directly into the editor
              </p>
            </div>
          </div>
        </div>
      </div>

    </div>
  `,
  styles: [`
    .modern-editor {
      min-height: 100vh;
      background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
    }

    /* Editor Header */
    .editor-header {
      background: white;
      border-bottom: 1px solid #e2e8f0;
      padding: 24px 0;
    }

    .header-content {
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .editor-title {
      margin: 0 0 8px 0;
      font-size: 28px;
      font-weight: bold;
      color: #1a202c;
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .title-icon {
      font-size: 32px;
    }

    .editor-subtitle {
      margin: 0;
      color: #64748b;
      font-size: 16px;
    }

    .header-actions {
      display: flex;
      gap: 12px;
    }

    .action-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .registry-btn {
      background: #3b82f6;
      color: white;
    }

    .registry-btn:hover {
      background: #2563eb;
      transform: translateY(-1px);
    }

    .evolution-btn {
      background: #10b981;
      color: white;
    }

    .evolution-btn:hover {
      background: #059669;
      transform: translateY(-1px);
    }

    /* Mode Selection */
    .mode-selection {
      max-width: 1400px;
      margin: 0 auto;
      padding: 48px 24px;
    }

    .mode-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(350px, 1fr));
      gap: 24px;
      margin-bottom: 48px;
    }

    .mode-card {
      background: white;
      border-radius: 16px;
      padding: 32px;
      text-align: center;
      cursor: pointer;
      transition: all 0.3s ease;
      border: 2px solid transparent;
      position: relative;
      overflow: hidden;
    }

    .mode-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
      border-color: #3b82f6;
    }

    .mode-card.recommended::before {
      content: "Recommended";
      position: absolute;
      top: 16px;
      right: -30px;
      background: #10b981;
      color: white;
      padding: 4px 40px;
      font-size: 12px;
      font-weight: bold;
      transform: rotate(45deg);
    }

    .mode-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .mode-title {
      margin: 0 0 12px 0;
      font-size: 24px;
      font-weight: bold;
      color: #1a202c;
    }

    .mode-description {
      margin: 0 0 20px 0;
      color: #64748b;
      line-height: 1.6;
    }

    .mode-features {
      display: flex;
      justify-content: center;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 20px;
    }

    .feature-tag {
      background: #e0f2fe;
      color: #0277bd;
      padding: 4px 12px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
    }

    .mode-action {
      padding-top: 16px;
      border-top: 1px solid #f1f5f9;
    }

    .action-text {
      color: #3b82f6;
      font-weight: 600;
    }

    /* Quick Actions */
    .quick-actions-section {
      margin-top: 48px;
    }

    .section-title {
      margin: 0 0 24px 0;
      font-size: 24px;
      font-weight: bold;
      color: #1a202c;
    }

    .quick-actions-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
    }

    .quick-action-card {
      background: white;
      border-radius: 12px;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      cursor: pointer;
      transition: all 0.2s ease;
      border: 1px solid #e2e8f0;
    }

    .quick-action-card:hover {
      border-color: #3b82f6;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
    }

    .quick-action-card.disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .action-icon {
      font-size: 24px;
      flex-shrink: 0;
    }

    .action-title {
      margin: 0 0 4px 0;
      font-size: 16px;
      font-weight: 600;
      color: #1a202c;
    }

    .action-description {
      margin: 0;
      font-size: 14px;
      color: #64748b;
    }

    /* Mode Headers */
    .mode-header {
      background: white;
      border-bottom: 1px solid #e2e8f0;
      padding: 20px 0;
    }

    .mode-header {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px 24px;
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .back-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      background: none;
      border: 1px solid #d1d5db;
      color: #6b7280;
      padding: 8px 16px;
      border-radius: 6px;
      cursor: pointer;
      font-size: 14px;
      transition: all 0.2s ease;
    }

    .back-btn:hover {
      background: #f9fafb;
      border-color: #9ca3af;
    }

    .mode-title {
      margin: 0;
      font-size: 24px;
      font-weight: bold;
      color: #1a202c;
    }

    /* Create Mode */
    .create-mode {
      max-width: 1400px;
      margin: 0 auto;
      padding: 32px 24px;
    }

    /* Template Section */
    .template-section {
      background: white;
      border-radius: 16px;
      padding: 32px;
      margin-bottom: 24px;
    }

    .template-categories {
      display: flex;
      gap: 8px;
      margin-bottom: 32px;
      flex-wrap: wrap;
    }

    .category-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      border: 2px solid #e5e7eb;
      background: white;
      border-radius: 8px;
      cursor: pointer;
      font-weight: 500;
      color: #6b7280;
      transition: all 0.2s ease;
    }

    .category-btn.active {
      border-color: #3b82f6;
      color: #3b82f6;
      background: #eff6ff;
    }

    .category-icon {
      font-size: 16px;
    }

    .templates-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
    }

    .template-card {
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      padding: 20px;
      cursor: pointer;
      transition: all 0.2s ease;
      background: white;
    }

    .template-card:hover {
      border-color: #3b82f6;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
    }

    .template-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 12px;
    }

    .template-name {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      color: #1a202c;
    }

    .template-tags {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }

    .template-tag {
      background: #f3f4f6;
      color: #374151;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 11px;
      font-weight: 500;
    }

    .template-description {
      margin: 0 0 16px 0;
      color: #64748b;
      line-height: 1.5;
    }

    .template-preview {
      background: #f8fafc;
      border-radius: 6px;
      padding: 12px;
      margin-bottom: 16px;
    }

    .schema-preview {
      margin: 0;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 12px;
      color: #334155;
      white-space: pre-wrap;
      overflow: hidden;
      text-overflow: ellipsis;
      display: -webkit-box;
      -webkit-line-clamp: 4;
      -webkit-box-orient: vertical;
    }

    /* Schema Editor */
    .schema-editor-section {
      background: white;
      border-radius: 16px;
      overflow: hidden;
    }

    .editor-toolbar {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      padding: 16px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .toolbar-info h3 {
      margin: 0 0 4px 0;
      font-size: 18px;
      color: #1a202c;
    }

    .template-category {
      background: #ddd6fe;
      color: #7c3aed;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 500;
    }

    .toolbar-actions {
      display: flex;
      gap: 8px;
    }

    .validate-btn {
      background: #059669;
      color: white;
    }

    .preview-btn {
      background: #0891b2;
      color: white;
    }

    .publish-btn {
      background: #dc2626;
      color: white;
    }

    .editor-workspace {
      display: grid;
      grid-template-columns: 350px 1fr auto;
      height: 600px;
    }

    /* Form Panel */
    .schema-form-panel {
      background: #f9fafb;
      border-right: 1px solid #e5e7eb;
      padding: 24px;
      overflow-y: auto;
    }

    .form-section {
      margin-bottom: 32px;
    }

    .form-section:last-child {
      margin-bottom: 0;
    }

    .form-section h4 {
      margin: 0 0 16px 0;
      font-size: 16px;
      font-weight: 600;
      color: #374151;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-size: 14px;
      font-weight: 500;
      color: #374151;
    }

    .form-control {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #d1d5db;
      border-radius: 6px;
      font-size: 14px;
      transition: border-color 0.2s;
    }

    .form-control:focus {
      outline: none;
      border-color: #3b82f6;
      box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
    }

    .field-help {
      font-size: 12px;
      color: #6b7280;
      margin-top: 4px;
    }

    /* JSON Editor Panel */
    .json-editor-panel {
      display: flex;
      flex-direction: column;
    }

    .editor-header {
      background: #f8fafc;
      border-bottom: 1px solid #e5e7eb;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .editor-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }

    .editor-actions {
      display: flex;
      gap: 8px;
    }

    .editor-btn {
      padding: 4px 8px;
      border: 1px solid #d1d5db;
      background: white;
      color: #374151;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }

    .editor-btn:hover {
      background: #f9fafb;
    }

    .json-editor {
      flex: 1;
      position: relative;
    }

    .json-textarea {
      width: 100%;
      height: 100%;
      padding: 16px;
      border: none;
      resize: none;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 14px;
      line-height: 1.5;
      background: #fefefe;
      color: #1f2937;
    }

    .json-textarea:focus {
      outline: none;
    }

    /* Validation Panel */
    .validation-panel {
      border-top: 1px solid #e5e7eb;
      background: #fefefe;
    }

    .validation-header {
      padding: 12px 16px;
      border-bottom: 1px solid #e5e7eb;
      background: #f9fafb;
    }

    .validation-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .status-icon.valid {
      color: #059669;
    }

    .status-icon.invalid {
      color: #dc2626;
    }

    .validation-content {
      padding: 12px 16px;
      max-height: 200px;
      overflow-y: auto;
    }

    .validation-item {
      margin-bottom: 8px;
      padding: 8px;
      border-radius: 4px;
      font-size: 13px;
    }

    .validation-item.error {
      background: #fef2f2;
      border-left: 4px solid #dc2626;
    }

    .suggestion {
      margin-top: 4px;
      font-style: italic;
      color: #6b7280;
    }

    /* Preview Panel */
    .preview-panel {
      width: 400px;
      border-left: 1px solid #e5e7eb;
      background: white;
      display: flex;
      flex-direction: column;
    }

    .preview-header {
      background: #f8fafc;
      border-bottom: 1px solid #e5e7eb;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .preview-header h4 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #374151;
    }

    .close-btn {
      background: none;
      border: none;
      font-size: 18px;
      color: #6b7280;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      transition: all 0.2s;
    }

    .close-btn:hover {
      background: #f3f4f6;
      color: #374151;
    }

    .preview-tabs {
      display: flex;
      border-bottom: 1px solid #e5e7eb;
    }

    .tab-btn {
      flex: 1;
      padding: 8px 12px;
      border: none;
      background: #f9fafb;
      color: #6b7280;
      cursor: pointer;
      font-size: 12px;
      transition: all 0.2s;
    }

    .tab-btn.active {
      background: white;
      color: #374151;
      border-bottom: 2px solid #3b82f6;
    }

    .preview-body {
      flex: 1;
      padding: 16px;
      overflow-y: auto;
    }

    .formatted-preview,
    .example-preview {
      margin: 0;
      font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
      font-size: 12px;
      line-height: 1.4;
      color: #1f2937;
      white-space: pre-wrap;
    }

    /* Evolution Mode */
    .evolve-mode {
      max-width: 1400px;
      margin: 0 auto;
      padding: 32px 24px;
    }

    .evolution-workflow {
      background: white;
      border-radius: 16px;
      padding: 32px;
    }

    .workflow-steps {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 24px;
      margin-bottom: 32px;
    }

    .workflow-step {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      padding: 20px;
      border: 2px solid #f1f5f9;
      border-radius: 12px;
      transition: all 0.2s ease;
    }

    .workflow-step.active {
      border-color: #3b82f6;
      background: #eff6ff;
    }

    .workflow-step.completed {
      border-color: #10b981;
      background: #ecfdf5;
    }

    .step-number {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      background: #e5e7eb;
      color: #6b7280;
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: bold;
      flex-shrink: 0;
    }

    .workflow-step.active .step-number {
      background: #3b82f6;
      color: white;
    }

    .workflow-step.completed .step-number {
      background: #10b981;
      color: white;
    }

    .step-title {
      margin: 0 0 4px 0;
      font-size: 16px;
      font-weight: 600;
      color: #1a202c;
    }

    .step-description {
      margin: 0;
      font-size: 14px;
      color: #64748b;
      line-height: 1.4;
    }

    .workflow-actions {
      display: flex;
      gap: 16px;
      justify-content: center;
    }

    .evolution-wizard-btn {
      background: #7c3aed;
      color: white;
      padding: 12px 24px;
    }

    .compatibility-btn {
      background: #0891b2;
      color: white;
      padding: 12px 24px;
    }

    /* Import Mode */
    .import-mode {
      max-width: 1400px;
      margin: 0 auto;
      padding: 32px 24px;
    }

    .import-options {
      background: white;
      border-radius: 16px;
      padding: 32px;
    }

    .import-method-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 24px;
    }

    .import-method {
      text-align: center;
      padding: 32px 24px;
      border: 2px solid #e5e7eb;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.3s ease;
    }

    .import-method:hover {
      border-color: #3b82f6;
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.1);
      transform: translateY(-2px);
    }

    .method-icon {
      font-size: 48px;
      margin-bottom: 16px;
    }

    .method-title {
      margin: 0 0 12px 0;
      font-size: 20px;
      font-weight: 600;
      color: #1a202c;
    }

    .method-description {
      margin: 0;
      color: #64748b;
      line-height: 1.5;
    }

    /* Responsive Design */
    @media (max-width: 1200px) {
      .editor-workspace {
        grid-template-columns: 1fr;
        grid-template-rows: auto 1fr auto;
      }

      .preview-panel {
        width: 100%;
        border-left: none;
        border-top: 1px solid #e5e7eb;
      }
    }

    @media (max-width: 768px) {
      .modern-editor {
        padding: 0;
      }

      .header-content {
        flex-direction: column;
        gap: 16px;
        text-align: center;
      }

      .mode-grid {
        grid-template-columns: 1fr;
        padding: 0 16px;
      }

      .quick-actions-grid {
        grid-template-columns: 1fr;
      }

      .editor-workspace {
        height: auto;
      }

      .schema-form-panel {
        padding: 16px;
      }

      .json-textarea {
        min-height: 300px;
      }

      .workflow-steps {
        grid-template-columns: 1fr;
      }

      .workflow-actions {
        flex-direction: column;
        align-items: center;
      }

      .import-method-grid {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class ModernSchemaEditorComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  // Mode management
  selectedMode: EditorMode | null = null;
  availableModes: EditorMode[] = [
    {
      mode: 'create',
      title: 'Create New Schema',
      description: 'Build a new JSON Schema from scratch using templates and guided workflows optimized for Schema Registry.',
      icon: '🛠️'
    },
    {
      mode: 'evolve',
      title: 'Evolve Existing Schema',
      description: 'Safely evolve an existing schema with compatibility analysis and automated migration planning.',
      icon: '🔄'
    },
    {
      mode: 'import',
      title: 'Import Schema',
      description: 'Import schemas from the Registry, files, URLs, or by pasting JSON for editing and enhancement.',
      icon: '📥'
    }
  ];

  // Quick actions
  quickActions: QuickAction[] = [
    {
      id: 'browse-registry',
      title: 'Browse Registry',
      description: 'Explore existing schemas in the registry',
      icon: '📚',
      route: '/registry/subjects'
    },
    {
      id: 'evolution-wizard',
      title: 'Evolution Wizard',
      description: 'Guided schema evolution workflow',
      icon: '🧙‍♂️',
      route: '/evolution/wizard'
    },
    {
      id: 'compatibility-check',
      title: 'Compatibility Check',
      description: 'Test schema compatibility',
      icon: '🔍',
      route: '/evolution/compatibility'
    },
    {
      id: 'registry-status',
      title: 'Registry Status',
      description: 'Check Schema Registry connection',
      icon: '🔌',
      action: () => this.checkRegistryStatus()
    }
  ];

  // Template management
  selectedTemplate: SchemaTemplate | null = null;
  selectedCategory: string = 'basic';
  templateCategories = [
    { id: 'basic', name: 'Basic', icon: '📝' },
    { id: 'business', name: 'Business', icon: '💼' },
    { id: 'technical', name: 'Technical', icon: '⚙️' },
    { id: 'event', name: 'Event', icon: '⚡' }
  ];

  schemaTemplates: SchemaTemplate[] = [
    {
      id: 'user-profile',
      name: 'User Profile',
      description: 'Standard user profile schema with common fields',
      category: 'business',
      tags: ['user', 'profile', 'identity'],
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://example.com/user-profile.schema.json',
        title: 'User Profile',
        type: PropertyType.OBJECT,
        properties: {
          id: { type: PropertyType.STRING, format: 'uuid' },
          email: { type: PropertyType.STRING, format: 'email' },
          name: { type: PropertyType.STRING },
          dateOfBirth: { type: PropertyType.STRING, format: 'date' }
        } as any,
        required: ['id', 'email', 'name']
      } as JsonSchema
    },
    {
      id: 'api-response',
      name: 'API Response',
      description: 'Standard API response wrapper schema',
      category: 'technical',
      tags: ['api', 'response', 'wrapper'],
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://example.com/api-response.schema.json',
        title: 'API Response',
        type: PropertyType.OBJECT,
        properties: {
          success: { type: PropertyType.BOOLEAN },
          data: { type: PropertyType.OBJECT },
          error: { 
            type: PropertyType.OBJECT,
            properties: {
              code: { type: PropertyType.STRING },
              message: { type: PropertyType.STRING }
            }
          },
          timestamp: { type: PropertyType.STRING, format: 'date-time' }
        } as any,
        required: ['success', 'timestamp']
      } as JsonSchema
    },
    {
      id: 'order-event',
      name: 'Order Event',
      description: 'E-commerce order event schema for event streaming',
      category: 'event',
      tags: ['order', 'event', 'ecommerce'],
      schema: {
        $schema: 'https://json-schema.org/draft/2020-12/schema',
        $id: 'https://example.com/order-event.schema.json',
        title: 'Order Event',
        type: PropertyType.OBJECT,
        properties: {
          orderId: { type: PropertyType.STRING },
          customerId: { type: PropertyType.STRING },
          eventType: { 
            type: PropertyType.STRING, 
            enum: ['created', 'updated', 'cancelled', 'completed'] 
          },
          timestamp: { type: PropertyType.STRING, format: 'date-time' },
          orderData: { type: PropertyType.OBJECT }
        } as any,
        required: ['orderId', 'customerId', 'eventType', 'timestamp']
      } as JsonSchema
    }
  ];

  // Form management
  schemaForm: FormGroup;
  schemaJSON = '';
  showPreview = false;
  previewTab: 'formatted' | 'example' = 'formatted';
  isValidating = false;
  validationResult: any = null;

  // Evolution workflow
  currentEvolutionStep = 0;
  evolutionSteps = [
    { title: 'Select Base Schema', description: 'Choose the existing schema to evolve' },
    { title: 'Define Changes', description: 'Make your schema modifications' },
    { title: 'Analyze Impact', description: 'Review compatibility and breaking changes' },
    { title: 'Plan Migration', description: 'Generate migration strategy' },
    { title: 'Deploy Changes', description: 'Publish to Schema Registry' }
  ];

  constructor(
    private formBuilder: FormBuilder,
    private router: Router,
    private navigationService: NavigationService,
    private registryService: SchemaRegistryService,
    private compatibilityService: JsonSchemaCompatibilityService,
    private evolutionService: JsonSchemaEvolutionService
  ) {
    this.schemaForm = this.formBuilder.group({
      subjectName: ['', Validators.required],
      title: ['', Validators.required],
      description: [''],
      version: ['1.0.0'],
      compatibilityLevel: ['BACKWARD'],
      enableValidation: [true],
      generateDocumentation: [false]
    });
  }

  ngOnInit(): void {
    this.initializeEditor();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeEditor(): void {
    // Listen for schema form changes
    this.schemaForm.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged()
      )
      .subscribe(() => {
        this.updateSchemaFromForm();
      });
  }

  // Mode Selection
  selectMode(mode: EditorMode): void {
    this.selectedMode = mode;
  }

  goBackToModeSelection(): void {
    this.selectedMode = null;
    this.selectedTemplate = null;
  }

  // Navigation
  navigateToRegistry(): void {
    this.router.navigate(['/registry/subjects']);
  }

  navigateToEvolution(): void {
    this.router.navigate(['/evolution']);
  }

  // Quick Actions
  executeQuickAction(action: QuickAction): void {
    if (action.disabled) return;

    if (action.route) {
      this.router.navigate([action.route]);
    } else if (action.action) {
      action.action();
    }
  }

  checkRegistryStatus(): void {
    // Implementation for checking registry status
    console.log('Checking registry status...');
  }

  // Template Management
  selectCategory(categoryId: string): void {
    this.selectedCategory = categoryId;
  }

  getFilteredTemplates(): SchemaTemplate[] {
    return this.schemaTemplates.filter(template => 
      this.selectedCategory === 'basic' || template.category === this.selectedCategory
    );
  }

  selectTemplate(template: SchemaTemplate): void {
    this.selectedTemplate = template;
    this.schemaJSON = JSON.stringify(template.schema, null, 2);
    
    // Update form with template values
    this.schemaForm.patchValue({
      title: template.schema.title,
      description: template.description,
      subjectName: template.id
    });
  }

  goBackToTemplates(): void {
    this.selectedTemplate = null;
    this.schemaJSON = '';
  }

  getTemplatePreview(template: SchemaTemplate): string {
    return JSON.stringify(template.schema, null, 2);
  }

  // Schema Editing
  onSchemaChange(schemaJson: string): void {
    this.schemaJSON = schemaJson;
    this.validateCurrentSchema();
  }

  updateSchemaFromForm(): void {
    if (!this.selectedTemplate) return;

    try {
      const schema = JSON.parse(this.schemaJSON);
      const formValue = this.schemaForm.value;
      
      schema.title = formValue.title;
      schema.description = formValue.description;
      
      this.schemaJSON = JSON.stringify(schema, null, 2);
    } catch (error) {
      // Invalid JSON, keep as is for user to fix
    }
  }

  formatJSON(): void {
    try {
      const parsed = JSON.parse(this.schemaJSON);
      this.schemaJSON = JSON.stringify(parsed, null, 2);
    } catch (error) {
      alert('Invalid JSON format');
    }
  }

  addProperty(): void {
    try {
      const schema = JSON.parse(this.schemaJSON);
      if (!schema.properties) {
        schema.properties = {};
      }
      
      schema.properties.newProperty = {
        type: 'string',
        description: 'New property'
      };
      
      this.schemaJSON = JSON.stringify(schema, null, 2);
    } catch (error) {
      alert('Cannot add property: Invalid JSON format');
    }
  }

  // Validation
  validateCurrentSchema(): void {
    if (!this.schemaJSON.trim()) {
      this.validationResult = null;
      return;
    }

    this.isValidating = true;
    
    try {
      const schema = JSON.parse(this.schemaJSON);
      
      // Use validation service
      setTimeout(() => {
        this.validationResult = {
          isValid: true, // Simplified for now
          errors: [],
          warnings: []
        };
        this.isValidating = false;
      }, 500);
    } catch (error) {
      this.validationResult = {
        isValid: false,
        errors: [{
          path: '$',
          message: 'Invalid JSON format',
          suggestion: 'Check for syntax errors in your JSON'
        }],
        warnings: []
      };
      this.isValidating = false;
    }
  }

  // Preview
  togglePreview(): void {
    this.showPreview = !this.showPreview;
  }

  getFormattedSchema(): string {
    try {
      const parsed = JSON.parse(this.schemaJSON);
      return JSON.stringify(parsed, null, 2);
    } catch (error) {
      return 'Invalid JSON format';
    }
  }

  getExampleData(): string {
    try {
      const schema = JSON.parse(this.schemaJSON);
      // Generate example data based on schema
      const example = this.generateExampleFromSchema(schema);
      return JSON.stringify(example, null, 2);
    } catch (error) {
      return 'Cannot generate example: Invalid schema';
    }
  }

  private generateExampleFromSchema(schema: any): any {
    // Simplified example generation
    const example: any = {};
    
    if (schema.properties) {
      Object.keys(schema.properties).forEach(key => {
        const prop = schema.properties[key];
        switch (prop.type) {
          case 'string':
            example[key] = prop.format === 'email' ? 'user@example.com' : 'example string';
            break;
          case 'number':
          case 'integer':
            example[key] = 42;
            break;
          case 'boolean':
            example[key] = true;
            break;
          case 'array':
            example[key] = [];
            break;
          case 'object':
            example[key] = {};
            break;
          default:
            example[key] = null;
        }
      });
    }
    
    return example;
  }

  // Publishing
  canPublish(): boolean {
    return this.schemaForm.valid && this.validationResult?.isValid && this.schemaJSON.trim() !== '';
  }

  publishToRegistry(): void {
    if (!this.canPublish()) return;

    const formValue = this.schemaForm.value;
    
    console.log('Publishing to registry:', {
      subject: formValue.subjectName,
      schema: this.schemaJSON,
      compatibilityLevel: formValue.compatibilityLevel
    });

    // Navigate to evolution wizard for actual publishing
    this.navigationService.navigateToEvolutionWizard(formValue.subjectName);
  }

  // Evolution Mode
  startEvolutionWizard(): void {
    this.router.navigate(['/evolution/wizard']);
  }

  openCompatibilityChecker(): void {
    this.router.navigate(['/evolution/compatibility']);
  }

  // Import Mode
  selectImportMethod(method: string): void {
    console.log('Selected import method:', method);
    
    switch (method) {
      case 'registry':
        this.router.navigate(['/registry/subjects']);
        break;
      case 'file':
        // Implement file upload
        break;
      case 'url':
        // Implement URL import
        break;
      case 'paste':
        // Switch to create mode with empty template
        this.selectMode(this.availableModes[0]);
        break;
    }
  }
}