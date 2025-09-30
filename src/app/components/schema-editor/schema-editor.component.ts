import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { PropertyTreeEditorComponent } from '../property-tree-editor/property-tree-editor.component';
import { SchemaPreviewComponent } from '../schema-preview/schema-preview.component';
import { CytoscapeDiagramComponent } from '../cytoscape-diagram/cytoscape-diagram.component';
import { SchemaBuilderService } from '../../services/schema-builder.service';
import { SchemaValidationService, ValidationResult, JsonSchemaDraft } from '../../services/schema-validation.service';
import { SchemaProperty, JsonSchema, PropertyType, SchemaConfiguration } from '../../models/schema.models';

@Component({
  selector: 'app-schema-editor',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    PropertyTreeEditorComponent,
    SchemaPreviewComponent,
    CytoscapeDiagramComponent
  ],
  templateUrl: './schema-editor.component.html',
  styleUrl: './schema-editor.component.scss'
})
export class SchemaEditorComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  schemaForm: FormGroup;
  configForm: FormGroup;
  schema: JsonSchema | null = null;
  properties: SchemaProperty[] = [];
  configuration: SchemaConfiguration | null = null;
  showPreview = false;
  showConfiguration = false;
  showSchemaInfo = true;
  showSidebar = true;
  activeRightTab: 'overview' | 'settings' = 'overview';
  showDiagram = false;
  showRightPanel = true;
  currentView: 'workspace' | 'preview' | 'diagram' = 'workspace';

  // Available JSON Schema draft versions
  availableDrafts = [
    { value: 'https://json-schema.org/draft-04/schema', label: 'Draft 04' },
    { value: 'https://json-schema.org/draft-06/schema', label: 'Draft 06' },
    { value: 'https://json-schema.org/draft-07/schema', label: 'Draft 07' },
    { value: 'https://json-schema.org/draft/2019-09/schema', label: 'Draft 2019-09' },
    { value: 'https://json-schema.org/draft/2020-12/schema', label: 'Draft 2020-12' }
  ];
  activeRightPanel: 'preview' | 'diagram' = 'preview';
  
  // Validation state
  validationResult: ValidationResult | null = null;
  selectedDraft: JsonSchemaDraft = 'draft-07';
  showValidationDetails = false;

  constructor(
    private schemaBuilder: SchemaBuilderService,
    private validationService: SchemaValidationService,
    private fb: FormBuilder
  ) {
    this.schemaForm = this.fb.group({
      title: new FormControl('New Schema'),
      description: new FormControl(''),
      additionalProperties: new FormControl(true)
    });
    
    this.configForm = this.fb.group({
      useReferences: new FormControl(false),
      generateDefinitions: new FormControl(true),
      enableInteractivePreview: new FormControl(false),
      draftVersion: new FormControl('https://json-schema.org/draft/2020-12/schema')
    });
  }

  ngOnInit(): void {
    // Subscribe to schema changes
    this.schemaBuilder.schema$
      .pipe(takeUntil(this.destroy$))
      .subscribe(schema => {
        this.schema = schema;
        this.updateSchemaForm(schema);
        
        // Auto-validate schema on changes (debounced)
        this.autoValidateSchema();
      });

    // Subscribe to properties changes
    this.schemaBuilder.properties$
      .pipe(takeUntil(this.destroy$))
      .subscribe(properties => {
        this.properties = properties;
        
        // Auto-validate on property changes
        this.autoValidateSchema();
      });

    // Subscribe to configuration changes
    this.schemaBuilder.configuration$
      .pipe(takeUntil(this.destroy$))
      .subscribe(config => {
        this.configuration = config;
        this.updateConfigForm(config);
      });

    // Listen to schema form changes
    this.schemaForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(values => {
        this.schemaBuilder.updateSchema({
          title: values.title,
          description: values.description,
          additionalProperties: values.additionalProperties
        });
      });
      
    // Listen to config form changes
    this.configForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(values => {
        this.schemaBuilder.updateConfiguration(values);
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private updateSchemaForm(schema: JsonSchema): void {
    this.schemaForm.patchValue({
      title: schema.title,
      description: schema.description,
      additionalProperties: schema.additionalProperties
    }, { emitEvent: false });
  }

  private updateConfigForm(config: SchemaConfiguration): void {
    this.configForm.patchValue({
      useReferences: config.useReferences,
      generateDefinitions: config.generateDefinitions,
      draftVersion: config.draftVersion
    }, { emitEvent: false });
  }

  addNewProperty(): void {
    const newProperty = this.schemaBuilder.createEmptyProperty();
    this.schemaBuilder.addProperty(newProperty);
  }

  onPropertyUpdated(property: SchemaProperty): void {
    this.schemaBuilder.updateProperty(property.id, property);
  }

  onPropertyDeleted(propertyId: string): void {
    this.schemaBuilder.removeProperty(propertyId);
  }

  onPropertyDuplicated(propertyId: string): void {
    this.schemaBuilder.duplicateProperty(propertyId);
  }

  togglePreview(): void {
    this.showPreview = !this.showPreview;
  }

  toggleConfiguration(): void {
    this.showConfiguration = !this.showConfiguration;
  }

  toggleSchemaInfo(): void {
    this.showSchemaInfo = !this.showSchemaInfo;
  }

  toggleDiagram(): void {
    this.showDiagram = !this.showDiagram;
    if (this.showDiagram && !this.showPreview) {
      this.activeRightPanel = 'diagram';
    }
  }

  setActiveRightPanel(panel: 'preview' | 'diagram'): void {
    this.activeRightPanel = panel;
  }

  setCurrentView(view: 'workspace' | 'preview' | 'diagram'): void {
    this.currentView = view;
  }

  toggleRightPanel(): void {
    this.showRightPanel = !this.showRightPanel;
  }

  copySchemaToClipboard(): void {
    const schema = this.schemaBuilder.getCurrentSchema();
    navigator.clipboard.writeText(JSON.stringify(schema, null, 2)).then(() => {
      // Could show a toast notification here
      console.log('Schema copied to clipboard');
    }).catch(err => {
      console.error('Failed to copy schema:', err);
    });
  }

  resetDiagramView(): void {
    // Placeholder for diagram reset functionality
    console.log('Resetting diagram view');
  }

  exportDiagramSVG(): void {
    // Placeholder for SVG export functionality
    console.log('Exporting diagram as SVG');
  }

  // Monaco Editor integration
  onSchemaUpdatedFromPreview(updatedSchema: JsonSchema): void {
    if (updatedSchema && typeof updatedSchema === 'object') {
      try {
        // Update the schema through the service to maintain consistency
        this.schemaBuilder.updateSchema(updatedSchema);
        console.log('Schema updated from Monaco editor');
      } catch (error) {
        console.error('Error updating schema from Monaco editor:', error);
      }
    }
  }

  getRequiredPropertiesCount(): number {
    const countRequired = (properties: SchemaProperty[]): number => {
      let count = 0;
      for (const prop of properties) {
        if (prop.required) {
          count++;
        }
        if (prop.properties) {
          count += countRequired(Object.values(prop.properties));
        }
      }
      return count;
    };
    return countRequired(this.properties);
  }

  isSchemaValid(): boolean {
    // Use cached validation result if available
    if (this.validationResult) {
      return this.validationResult.isValid;
    }
    
    // Quick validation - check if schema has basic structure
    if (!this.schema) {
      return false;
    }
    
    // Basic check without full validation
    return this.properties.length > 0 && (!!this.schema.title?.trim());
  }

  getPropertyTypeSummary(): {[key: string]: number} {
    const summary: {[key: string]: number} = {};
    
    const countTypes = (properties: SchemaProperty[]): void => {
      for (const prop of properties) {
        const type = prop.type || 'object';
        summary[type] = (summary[type] || 0) + 1;
        
        if (prop.properties) {
          countTypes(Object.values(prop.properties));
        }
      }
    };
    
    countTypes(this.properties);
    return summary;
  }

  getPropertyTypeSummaryEntries(): {type: string, count: number}[] {
    const summary = this.getPropertyTypeSummary();
    return Object.entries(summary).map(([type, count]) => ({ type, count }));
  }

  exportSchema(): void {
    const jsonSchema = this.schemaBuilder.exportAsJson();
    this.downloadFile(jsonSchema, 'schema.json', 'application/json');
  }

  importSchema(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      
      reader.onload = (e) => {
        const content = e.target?.result as string;
        const success = this.schemaBuilder.loadFromJsonSchema(content);
        
        if (!success) {
          alert('Invalid JSON schema file');
        }
      };
      
      reader.readAsText(file);
    }
  }

  private downloadFile(content: string, fileName: string, contentType: string): void {
    const blob = new Blob([content], { type: contentType });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  resetSchema(): void {
    if (confirm('Are you sure you want to reset the schema? All changes will be lost.')) {
      this.schemaBuilder.resetSchema();
    }
  }

  movePropertyUp(index: number): void {
    if (index > 0) {
      this.schemaBuilder.moveProperty(index, index - 1);
    }
  }

  movePropertyDown(index: number): void {
    if (index < this.properties.length - 1) {
      this.schemaBuilder.moveProperty(index, index + 1);
    }
  }

  trackByPropertyId(index: number, property: SchemaProperty): string {
    return property.id;
  }

  expandAll(): void {
    // This would need to be implemented via a service method or event emitter
    // For now, we'll show a notification that this feature expands all properties
    console.log('Expanding all properties');
    // TODO: Implement expand all functionality
  }

  collapseAll(): void {
    // This would need to be implemented via a service method or event emitter
    console.log('Collapsing all properties');
    // TODO: Implement collapse all functionality
  }

  validateSchema(): void {
    try {
      // Get current schema
      if (!this.schema) {
        alert('❌ No schema to validate');
        return;
      }

      // Perform comprehensive validation
      this.validationResult = this.validationService.validateSchema(this.schema, this.selectedDraft);
      
      // Show results
      if (this.validationResult.isValid) {
        const summary = this.validationResult.summary;
        let message = `✅ Schema validation passed!\n\n`;
        message += `📊 Summary:\n`;
        message += `• Properties validated: ${summary.propertiesValidated}\n`;
        message += `• Draft: ${this.validationResult.draft}\n`;
        
        if (this.validationResult.warnings.length > 0) {
          message += `• Warnings: ${summary.totalWarnings}\n`;
          message += `\nClick "View Details" to see warnings.`;
        } else {
          message += `• No issues found`;
        }
        
        alert(message);
      } else {
        const summary = this.validationResult.summary;
        let message = `⚠️ Schema validation found issues:\n\n`;
        message += `📊 Summary:\n`;
        message += `• Errors: ${summary.totalErrors}\n`;
        message += `• Warnings: ${summary.totalWarnings}\n`;
        message += `• Properties checked: ${summary.propertiesValidated}\n`;
        message += `• Draft: ${this.validationResult.draft}\n\n`;
        
        // Show first few errors
        const maxErrors = 3;
        message += `🚨 First ${Math.min(maxErrors, this.validationResult.errors.length)} error(s):\n`;
        this.validationResult.errors.slice(0, maxErrors).forEach((error, index) => {
          message += `${index + 1}. ${error.path}: ${error.message}\n`;
          if (error.suggestion) {
            message += `   💡 ${error.suggestion}\n`;
          }
        });
        
        if (this.validationResult.errors.length > maxErrors) {
          message += `... and ${this.validationResult.errors.length - maxErrors} more error(s)\n`;
        }
        
        message += `\nClick "View Details" to see all issues.`;
        alert(message);
      }
      
      // Enable detailed view
      this.showValidationDetails = true;
      
    } catch (error) {
      console.error('Validation error:', error);
      alert('❌ Validation failed: ' + error);
    }
  }

  toggleValidationDetails(): void {
    this.showValidationDetails = !this.showValidationDetails;
  }

  getSupportedDrafts(): JsonSchemaDraft[] {
    return this.validationService.getSupportedDrafts();
  }

  onDraftChange(draft: JsonSchemaDraft): void {
    this.selectedDraft = draft;
    // Re-validate if we have results
    if (this.validationResult) {
      this.validateSchema();
    }
  }

  private autoValidateSchema(): void {
    // Perform background validation without showing alerts
    if (this.schema) {
      try {
        this.validationResult = this.validationService.validateSchema(this.schema, this.selectedDraft);
      } catch (error) {
        console.warn('Auto-validation failed:', error);
        this.validationResult = null;
      }
    }
  }

  getValidationStatusColor(): string {
    if (!this.validationResult) {
      return '#6c757d'; // Gray for unknown
    }
    return this.validationResult.isValid ? '#28a745' : '#dc3545';
  }

  getValidationStatusIcon(): string {
    if (!this.validationResult) {
      return '?'; // Unknown status
    }
    return this.validationResult.isValid ? '✓' : '⚠';
  }

  getValidationStatusText(): string {
    if (!this.validationResult) {
      return 'Not Validated';
    }
    return this.validationResult.isValid ? 'Valid Schema' : 'Has Issues';
  }

  loadTemplate(templateType: string): void {
    if (confirm('Loading a template will replace your current schema. Continue?')) {
      switch (templateType) {
        case 'basic':
          this.loadBasicTemplate();
          break;
        default:
          console.log('Unknown template type:', templateType);
      }
    }
  }

  private loadBasicTemplate(): void {
    // Reset current schema
    this.schemaBuilder.resetSchema();
    
    // Set basic schema info
    this.schemaForm.patchValue({
      title: 'User Profile Schema',
      description: 'A basic schema for user profiles',
      additionalProperties: false
    });
    
    // Add basic properties
    const nameProperty = this.schemaBuilder.createEmptyProperty();
    nameProperty.name = 'name';
    nameProperty.type = PropertyType.STRING;
    nameProperty.title = 'Full Name';
    nameProperty.description = 'User\'s full name';
    nameProperty.required = true;
    this.schemaBuilder.addProperty(nameProperty);
    
    const emailProperty = this.schemaBuilder.createEmptyProperty();
    emailProperty.name = 'email';
    emailProperty.type = PropertyType.STRING;
    emailProperty.title = 'Email Address';
    emailProperty.format = 'email';
    emailProperty.required = true;
    this.schemaBuilder.addProperty(emailProperty);
    
    const ageProperty = this.schemaBuilder.createEmptyProperty();
    ageProperty.name = 'age';
    ageProperty.type = PropertyType.NUMBER;
    ageProperty.title = 'Age';
    ageProperty.minimum = 0;
    ageProperty.maximum = 150;
    this.schemaBuilder.addProperty(ageProperty);
  }

  setActiveRightTab(tab: 'overview' | 'settings'): void {
    this.activeRightTab = tab;
  }
}
