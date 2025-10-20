import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, FormControl } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { PropertyTreeEditorComponent } from '../property-tree-editor/property-tree-editor.component';
import { SchemaPreviewComponent } from '../schema-preview/schema-preview.component';
import { CytoscapeDiagramComponent } from '../cytoscape-diagram/cytoscape-diagram.component';
import { DependencyEditorComponent } from '../dependency-editor/dependency-editor.component';
import { RegistryConnectionComponent } from '../registry/registry-connection.component';
import { FeatureGuideComponent } from '../shared/feature-guide.component';
import { SchemaBuilderService } from '../../services/schema-builder.service';
import { SchemaValidationService, ValidationResult, JsonSchemaDraft } from '../../services/schema-validation.service';
import { SchemaRegistryService } from '../../services/registry/schema-registry.service';
import { SchemaProperty, JsonSchema, PropertyType, SchemaConfiguration, getIdFieldForDraft } from '../../models/schema.models';

@Component({
  selector: 'app-schema-editor',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    PropertyTreeEditorComponent,
    SchemaPreviewComponent,
    CytoscapeDiagramComponent,
    DependencyEditorComponent,
    RegistryConnectionComponent,
    FeatureGuideComponent
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
  showRootDependencyEditor = false;
  schemaValidationExpanded = true; // Default to expanded for better UX

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
    private registryService: SchemaRegistryService,
    private fb: FormBuilder
  ) {
    this.schemaForm = this.fb.group({
      title: new FormControl('New Schema'),
      description: new FormControl(''),
      schemaId: new FormControl(''),
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
        // Create update object with ID field based on current draft
        const updateObj: any = {
          title: values.title,
          description: values.description,
          additionalProperties: values.additionalProperties
        };
        
        // Add the appropriate ID field based on current draft
        if (values.schemaId) {
          if (this.currentIdField === 'id') {
            updateObj.id = values.schemaId;
            updateObj.$id = undefined; // Clear $id when using id
          } else {
            updateObj.$id = values.schemaId;
            updateObj.id = undefined; // Clear id when using $id
          }
        }
        
        this.schemaBuilder.updateSchema(updateObj);
      });
      
    // Listen to config form changes
    this.configForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(values => {
        const previousDraft = this.selectedDraft;
        
        this.schemaBuilder.updateConfiguration(values);
        
        // Synchronize selectedDraft with draftVersion URL
        if (values.draftVersion) {
          const newDraft = SchemaValidationService.urlToDraftName(values.draftVersion);
          this.selectedDraft = newDraft;
          
          // Handle draft change - migrate ID field if needed
          if (previousDraft !== newDraft) {
            this.handleDraftChange(newDraft);
          }
        }
      });

    // Initialize selectedDraft based on current config
    const currentConfig = this.schemaBuilder.getConfiguration();
    this.selectedDraft = SchemaValidationService.urlToDraftName(currentConfig.draftVersion);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  get currentIdField(): 'id' | '$id' {
    const currentDraft = this.configForm.get('draftVersion')?.value || 'https://json-schema.org/draft/2020-12/schema';
    return getIdFieldForDraft(SchemaValidationService.urlToDraftName(currentDraft));
  }

  private updateSchemaForm(schema: JsonSchema): void {
    // Get the appropriate ID value based on draft version
    const idValue = schema.$id || schema.id || '';
    
    this.schemaForm.patchValue({
      title: schema.title,
      description: schema.description,
      schemaId: idValue,
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

  private handleDraftChange(newDraft: string): void {
    // When draft changes, we need to update the schema to use the correct ID field
    const currentSchema = this.schemaBuilder.getCurrentSchema();
    const currentIdValue = currentSchema.$id || currentSchema.id || '';
    
    // Update the form with current ID value to ensure it's preserved
    this.schemaForm.patchValue({
      schemaId: currentIdValue
    }, { emitEvent: false });
    
    // Force schema update with proper ID field migration
    if (currentIdValue) {
      const newIdField = getIdFieldForDraft(newDraft);
      const updateObj: any = {};
      
      if (newIdField === 'id') {
        updateObj.id = currentIdValue;
        updateObj.$id = undefined; // Clear $id field
      } else {
        updateObj.$id = currentIdValue;
        updateObj.id = undefined; // Clear id field
      }
      
      this.schemaBuilder.updateSchema(updateObj);
    }
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
    
    // Synchronize config form with selectedDraft
    const draftUrl = SchemaValidationService.draftNameToUrl(draft);
    this.configForm.patchValue({ draftVersion: draftUrl }, { emitEvent: false });
    
    // Update schema builder configuration
    const currentConfig = this.schemaBuilder.getConfiguration();
    this.schemaBuilder.updateConfiguration({ ...currentConfig, draftVersion: draftUrl });
    
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

  // Root-level dependency methods for schema-wide conditional validation
  hasRootLevelConditionalLogic(): boolean {
    return !!(this.schema?.allOf && Array.isArray(this.schema.allOf) && 
              this.schema.allOf.some((item: any) => item.if && item.then));
  }

  extractRootDependentSchemas(): { [key: string]: any } {
    if (!this.schema?.allOf) return {};
    
    const dependentSchemas: { [key: string]: any } = {};
    
    (this.schema.allOf as any[]).forEach(item => {
      if (item.if && item.then) {
        // Extract condition property from if clause
        if (item.if.properties) {
          Object.keys(item.if.properties).forEach(conditionProp => {
            const condition = item.if.properties[conditionProp];
            
            // Handle different condition types
            let key = conditionProp; // Default for 'exists' condition
            
            if (condition.const !== undefined) {
              key = conditionProp; // Use property name as key for all conditions
            } else if (condition.enum !== undefined) {
              key = conditionProp; // in-array condition
            } else if (condition.not !== undefined) {
              key = conditionProp; // not-equals condition
            } else if (item.if.required && item.if.required.includes(conditionProp)) {
              key = conditionProp; // exists condition
            }
            
            dependentSchemas[key] = {
              if: item.if,
              then: item.then,
              else: item.else
            };
          });
        }
      }
    });
    
    return dependentSchemas;
  }

  getAllSchemaPropertyNames(): string[] {
    if (!this.schema?.properties) return [];
    return Object.keys(this.schema.properties);
  }

  updateRootDependentSchemas(dependentSchemas: { [key: string]: any }): void {
    // Convert dependent schemas back to allOf format for root-level storage
    const allOfItems: any[] = [];
    
    Object.keys(dependentSchemas).forEach(key => {
      const schema = dependentSchemas[key];
      if (schema.if && schema.then) {
        // Convert SchemaProperty objects to clean JSON Schema objects
        const allOfItem: any = {
          if: this.convertConditionalSchemaToJsonSchema(schema.if),
          then: this.convertConditionalSchemaToJsonSchema(schema.then)
        };
        if (schema.else) {
          allOfItem.else = this.convertConditionalSchemaToJsonSchema(schema.else);
        }
        allOfItems.push(allOfItem);
      }
    });
    
    // Update the schema
    this.schemaBuilder.updateSchema({ allOf: allOfItems });
  }

  private convertSchemaPropertyToJsonSchema(prop: any): any {
    if (!prop) return {};
    
    // If it's already a simple object, return as-is
    if (!prop.id && !prop.name) {
      return prop;
    }

    // Convert SchemaProperty to clean JSON Schema
    const jsonSchema: any = {};
    
    if (prop.type) {
      jsonSchema.type = prop.type.toLowerCase();
    }
    
    if (prop.properties) {
      jsonSchema.properties = {};
      Object.keys(prop.properties).forEach(propKey => {
        jsonSchema.properties[propKey] = this.convertSchemaPropertyToJsonSchema(prop.properties[propKey]);
      });
    }
    
    if (prop.required === true || (Array.isArray(prop.required) && prop.required.length > 0)) {
      jsonSchema.required = Array.isArray(prop.required) ? prop.required : Object.keys(prop.properties || {});
    }
    
    // Special handling for existence checks: if this is an 'if' condition for property existence,
    // add the property to the required array
    if (prop.name === 'if_condition' && prop.properties && Object.keys(prop.properties).length === 1) {
      const propertyName = Object.keys(prop.properties)[0];
      jsonSchema.required = [propertyName];
    }
    
    // Copy other relevant properties
    ['const', 'enum', 'pattern', 'minimum', 'maximum', 'minLength', 'maxLength'].forEach(key => {
      if (prop[key] !== undefined) {
        jsonSchema[key] = prop[key];
      }
    });
    
    return jsonSchema;
  }

  private convertConditionalSchemaToJsonSchema(prop: any): any {
    if (!prop) return {};
    
    // If it's already a simple object, return as-is
    if (!prop.id && !prop.name && !prop.type) {
      return prop;
    }

    // Special handling for 'then' schemas with required properties
    if (prop.name && prop.name.startsWith('then_')) {
      console.log('🔍 Converting then schema:', prop.name, 'requiredProperties:', prop.requiredProperties);
      const result: any = {
        type: 'object'
      };
      
      if (prop.requiredProperties && prop.requiredProperties.length > 0) {
        result.required = [...prop.requiredProperties];
        console.log('✅ Added required array to then schema:', result.required);
      }
      
      if (prop.properties && Object.keys(prop.properties).length > 0) {
        result.properties = {};
        Object.keys(prop.properties).forEach(propKey => {
          result.properties[propKey] = this.convertSchemaPropertyToJsonSchema(prop.properties[propKey]);
        });
      }
      
      if (prop.description) {
        result.description = prop.description;
      }
      
      console.log('📤 Final then result:', result);
      return result;
    }

    // Special handling for 'if' conditions
    if ((prop.name === 'if_condition' || prop.name === 'if_condition_exists') && prop.properties) {
      const result: any = {};
      
      // Extract the single property condition
      const propertyKeys = Object.keys(prop.properties);
      if (propertyKeys.length === 1) {
        const propertyName = propertyKeys[0];
        const propertySchema = prop.properties[propertyName];
        
        result.properties = {
          [propertyName]: {}
        };
        
        // Add the condition (const, enum, not, etc.)
        if (propertySchema.const !== undefined) {
          result.properties[propertyName].const = propertySchema.const;
        }
        if (propertySchema.enum !== undefined) {
          result.properties[propertyName].enum = propertySchema.enum;
        }
        if (propertySchema.pattern !== undefined) {
          result.properties[propertyName].pattern = propertySchema.pattern;
        }
        if (propertySchema.not !== undefined) {
          result.properties[propertyName].not = propertySchema.not;
        }
        
        // For existence check, add required array
        const isExistenceCheck = !propertySchema.const && !propertySchema.enum && !propertySchema.pattern && !propertySchema.not;
        if (isExistenceCheck) {
          result.required = [propertyName];
        }
      }
      
      return result;
    }

    // For 'then' and 'else' clauses, convert normally but don't add unnecessary wrapper
    const jsonSchema: any = {};
    
    if (prop.properties) {
      jsonSchema.properties = {};
      Object.keys(prop.properties).forEach(propKey => {
        jsonSchema.properties[propKey] = this.convertSchemaPropertyToJsonSchema(prop.properties[propKey]);
      });
      
      // Only add type: object if we have properties
      if (Object.keys(jsonSchema.properties).length > 0) {
        jsonSchema.type = 'object';
      }
    }
    
    // Copy validation constraints
    ['required', 'minProperties', 'maxProperties', 'additionalProperties'].forEach(key => {
      if (prop[key] !== undefined) {
        jsonSchema[key] = prop[key];
      }
    });
    
    return jsonSchema;
  }

  addSchemaLevelValidation(): void {
    this.showRootDependencyEditor = true;
    
    // Initialize with a helpful example if no properties exist yet
    if (this.getAllSchemaPropertyNames().length === 0) {
      // Add some example properties to make the dependency editor useful
      this.addExamplePropertiesForValidation();
    }
  }

  private addExamplePropertiesForValidation(): void {
    // Add country property
    const countryProperty = this.schemaBuilder.createEmptyProperty();
    countryProperty.name = 'country';
    countryProperty.type = PropertyType.STRING;
    countryProperty.title = 'Country';
    countryProperty.enum = ['US', 'CA', 'UK', 'DE', 'FR'];
    this.schemaBuilder.addProperty(countryProperty);
    
    // Add postal code property  
    const postalProperty = this.schemaBuilder.createEmptyProperty();
    postalProperty.name = 'postalCode';
    postalProperty.type = PropertyType.STRING;
    postalProperty.title = 'Postal Code';
    postalProperty.description = 'Format will be validated based on country';
    this.schemaBuilder.addProperty(postalProperty);
  }

  hideRootDependencyEditor(): void {
    this.showRootDependencyEditor = false;
  }

  toggleSchemaValidationSection(): void {
    this.schemaValidationExpanded = !this.schemaValidationExpanded;
  }

  // Registry integration methods
  isRegistryConnected(): boolean {
    return this.registryService.getConnectionStatus().connected;
  }

  publishToRegistry(): void {
    if (!this.isRegistryConnected()) {
      alert('Please connect to Schema Registry first');
      return;
    }

    const currentSchema = this.schemaBuilder.getCurrentSchema();
    
    // Simple subject name prompt - in production you'd have a proper dialog
    const subjectName = prompt('Enter subject name for this schema:');
    if (!subjectName) {
      return;
    }

    console.log('Publishing schema to registry...', { subjectName, schema: currentSchema });

    this.registryService.configure({
      url: '/api/schema-registry',
      authentication: { type: 'none' },
      defaultCompatibilityLevel: 'BACKWARD',
      timeout: 10000,
      retryAttempts: 1
    });

    // Use the registerJsonSchema method from the service
    this.registryService.registerJsonSchema({
      subject: subjectName,
      schema: currentSchema,
      validateCompatibility: true
    }).subscribe({
      next: (result) => {
        if (result.success) {
          alert(`✅ Schema published successfully!\nSubject: ${subjectName}\nVersion: ${result.version || 'N/A'}`);
          console.log('✅ Schema published:', result);
        } else {
          alert(`❌ Publishing failed:\n${result.errors?.join('\n') || 'Unknown error'}`);
          console.error('❌ Publishing failed:', result.errors);
        }
      },
      error: (error) => {
        alert(`❌ Publishing error:\n${error.message || error}`);
        console.error('❌ Publishing error:', error);
      }
    });
  }
}
