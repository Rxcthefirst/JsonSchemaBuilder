import { Component, OnInit, OnDestroy, effect, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Router, ActivatedRoute } from '@angular/router';
import { Subject } from 'rxjs';
import { takeUntil, debounceTime, distinctUntilChanged } from 'rxjs/operators';

import { SchemaRegistryService } from '../../services/registry/schema-registry.service';
import { JsonSchemaCompatibilityService } from '../../services/registry/compatibility.service';
import { JsonSchemaEvolutionService } from '../../services/validation/json-schema-evolution.service';
import { NavigationService } from '../../services/navigation/navigation.service';
import { GlobalSchemaStateService } from '../../services/global-schema-state.service';
import { SchemaValidationService } from '../../services/schema-validation.service';

// Enhanced UI Components (to be added when available)
// import { PropertyTreeEditorComponent } from '../property-tree-editor/property-tree-editor.component';
// import { SchemaPreviewComponent } from '../schema-preview/schema-preview.component';
// import { CytoscapeDiagramComponent } from '../cytoscape-diagram/cytoscape-diagram.component';

import { 
  JsonSchema, 
  SchemaProperty, 
  PropertyType 
} from '../../models/schema.models';
import { 
  SchemaVersion,
  CompatibilityLevel,
  PublishConfig
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
  templateUrl: './modern-schema-editor.component.html',
  styleUrl: './modern-schema-editor.component.scss'
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
  
  // Editor state
  activeEditorTab: 'json' | 'visual' = 'json';

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
    private route: ActivatedRoute,
    private navigationService: NavigationService,
    private registryService: SchemaRegistryService,
    private compatibilityService: JsonSchemaCompatibilityService,
    private evolutionService: JsonSchemaEvolutionService,
    public globalState: GlobalSchemaStateService,
    private validationService: SchemaValidationService,
    private cdr: ChangeDetectorRef
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

    // Subscribe to global schema state using effect (must be in injection context)
    effect(() => {
      const state = this.globalState.state();
      this.updateFormFromState(state);
      this.showPreview = state.showPreview;
      this.validationResult = {
        isValid: state.isValid,
        errors: state.validationErrors,
        warnings: []
      };
    });
  }

  ngOnInit(): void {
    this.initializeEditor();
    this.handleRouteParameters();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeEditor(): void {
    // Start in create mode by default to show editor immediately
    this.selectedMode = this.availableModes.find(mode => mode.mode === 'create') || null;
    
    // Initialize with a basic schema template
    this.initializeBasicSchema();

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

  private initializeBasicSchema(): void {
    // Initialize with a comprehensive Draft 2020-12 example schema for testing
    const personSchema: JsonSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      $id: 'https://example.com/person.schema.json',
      title: 'Person Schema - Draft 2020-12',
      description: 'A comprehensive schema demonstrating Draft 2020-12 features',
      type: PropertyType.OBJECT,
      properties: {
        name: {
          type: 'string' as any,
          minLength: 1,
          maxLength: 100,
          examples: ['John Doe', 'Jane Smith']
        },
        age: {
          type: 'integer' as any,
          minimum: 0,
          maximum: 150,
          description: 'Age in years'
        },
        emails: {
          type: 'array' as any,
          prefixItems: [
            { type: 'string' as any, format: 'email', description: 'Primary email' },
            { type: 'string' as any, format: 'email', description: 'Secondary email' }
          ],
          unevaluatedItems: false,
          minItems: 1
        },
        address: {
          type: 'object' as any,
          properties: {
            street: { type: 'string' as any },
            city: { type: 'string' as any },
            zipCode: { type: 'string' as any, pattern: '^[0-9]{5}(-[0-9]{4})?$' }
          },
          required: ['street', 'city'],
          unevaluatedProperties: false
        },
        status: {
          oneOf: [
            { const: 'active' },
            { const: 'inactive' },
            { const: 'pending' }
          ]
        }
      } as any,
      required: ['name', 'age'],
      dependentRequired: {
        emails: ['name']
      },
      unevaluatedProperties: false,
      examples: [
        {
          name: 'John Doe',
          age: 30,
          emails: ['john@example.com'],
          address: {
            street: '123 Main St',
            city: 'Anytown',
            zipCode: '12345'
          },
          status: 'active'
        }
      ]
    };
    
    this.schemaJSON = JSON.stringify(personSchema, null, 2);
    this.globalState.loadSchema(personSchema);
    
    // Pre-populate form with reasonable defaults
    this.schemaForm.patchValue({
      subjectName: 'person-schema',
      title: 'Person Schema - Draft 2020-12',
      description: 'A comprehensive schema demonstrating Draft 2020-12 features',
      version: '1.0.0',
      compatibilityLevel: 'BACKWARD',
      enableValidation: true,
      generateDocumentation: false
    });
  }

  private handleRouteParameters(): void {
    // Handle loading from registry or other sources via route parameters
    this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(params => {
      if (params['subject'] && params['version']) {
        console.log('Loading from registry:', params['subject'], params['version']);
        this.loadFromRegistry(params['subject'], parseInt(params['version']));
      } else if (params['template']) {
        this.loadFromTemplate(params['template']);
      }
    });
  }

  private updateFormFromState(state: any): void {
    if (state.schema) {
      this.schemaForm.patchValue({
        subjectName: state.subjectName || '',
        title: state.schema.title || '',
        description: state.schema.description || '',
        version: '1.0.0', // Will be updated based on registry info
        compatibilityLevel: state.compatibilityLevel || 'BACKWARD'
      }, { emitEvent: false });
      
      this.schemaJSON = JSON.stringify(state.schema, null, 2);
    }
  }

  private getModeFromState(stateMode: string): EditorMode | null {
    switch (stateMode) {
      case 'create':
        return this.availableModes[0];
      case 'edit':
      case 'evolve':
        return this.availableModes[1];
      default:
        return null;
    }
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
      
      setTimeout(() => {
        this.validationResult = {
          isValid: true,
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
      const example = this.generateExampleFromSchema(schema);
      return JSON.stringify(example, null, 2);
    } catch (error) {
      return 'Cannot generate example: Invalid schema';
    }
  }

  private generateExampleFromSchema(schema: any): any {
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

  // Registry Operations
  openLoadFromRegistry(): void {
    // For now, navigate to the registry browser
    this.router.navigate(['/registry/subjects']);
  }

  testRegistryWorkflow(): void {
    if (!this.canPublish()) {
      alert('Please fix validation errors and fill required fields before testing.');
      return;
    }

    const formValue = this.schemaForm.value;
    
    try {
      const schema = JSON.parse(this.schemaJSON);
      
      // Show a summary of what would be published
      const summary = `
TEST WORKFLOW SUMMARY:
===================

Subject: ${formValue.subjectName}
Title: ${formValue.title}
Description: ${formValue.description}
Version: ${formValue.version}
Compatibility Level: ${formValue.compatibilityLevel}

Schema Properties: ${Object.keys(schema.properties || {}).length} properties
Required Fields: ${(schema.required || []).join(', ') || 'None'}
Schema Type: ${schema.type || 'Not specified'}
Schema Draft: ${schema.$schema || 'Not specified'}

✅ Schema JSON is valid
✅ All required metadata provided
✅ Ready for registry publication

Click "Publish to Registry" to actually register this schema.
      `;
      
      alert(summary);
      
    } catch (error) {
      alert('Invalid JSON schema. Please fix syntax errors first.');
    }
  }

  canPublish(): boolean {
    return this.schemaForm.valid && this.validationResult?.isValid && this.schemaJSON.trim() !== '';
  }

  publishToRegistry(): void {
    if (!this.canPublish()) return;

    const formValue = this.schemaForm.value;
    
    try {
      const schema = JSON.parse(this.schemaJSON);
      
      // Update schema metadata from form
      schema.title = formValue.title;
      schema.description = formValue.description;
      
      const publishConfig: PublishConfig = {
        subject: formValue.subjectName,
        schema: schema,
        compatibilityLevel: formValue.compatibilityLevel as CompatibilityLevel,
        validateCompatibility: formValue.enableValidation,
        normalize: true
      };

      console.log('Publishing to registry:', publishConfig);
      
      // Call the registry service to register the schema
      this.registryService.registerJsonSchema(publishConfig).subscribe({
        next: (result: any) => {
          console.log('Schema registered successfully:', result);
          // Show success message
          alert(`Schema registered successfully! Version: ${result.version || 'N/A'}, ID: ${result.id || 'N/A'}`);
          // Navigate to the subject details page to show the newly registered schema
          this.router.navigate(['/registry/subject', formValue.subjectName, 'details']);
        },
        error: (error: any) => {
          console.error('Failed to register schema:', error);
          // Show error message to user
          const errorMessage = error?.error?.message || error?.message || 'Unknown error occurred';
          alert(`Failed to register schema: ${errorMessage}`);
        }
      });
      
    } catch (error) {
      console.error('Invalid JSON schema:', error);
      alert('Please fix JSON syntax errors before publishing');
    }
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
        this.handleFileUpload();
        break;
      case 'url':
        this.handleUrlImport();
        break;
      case 'paste':
        this.selectMode(this.availableModes[0]);
        break;
    }
  }

  // Registry Loading
  private loadFromRegistry(subjectName: string, version: number): void {
    console.log('Starting loadFromRegistry:', subjectName, version);
    
    this.registryService.getSchemaVersion(subjectName, version)
      .subscribe({
        next: (schemaVersion) => {
          console.log('Received schema version:', schemaVersion);
          
          // Load the schema into the global state
          this.globalState.loadFromRegistry(subjectName, schemaVersion);
          
          // Parse the schema string to object
          let schemaObj: any = {};
          try {
            schemaObj = typeof schemaVersion.schema === 'string' 
              ? JSON.parse(schemaVersion.schema) 
              : schemaVersion.schema;
            console.log('Parsed schema object:', schemaObj);
          } catch (e) {
            console.error('Failed to parse schema:', e);
          }
          
          // Directly update the form and JSON to ensure immediate display
          this.schemaForm.patchValue({
            subjectName: subjectName,
            title: schemaObj.title || `${subjectName} v${version}`,
            description: schemaObj.description || '',
            version: version.toString(),
            compatibilityLevel: 'BACKWARD'
          });
          
          this.schemaJSON = JSON.stringify(schemaObj, null, 2);
          console.log('Updated schemaJSON:', this.schemaJSON.substring(0, 100) + '...');
          
          // Force immediate mode selection to show editor
          this.selectedMode = this.availableModes[1]; // Evolve mode
          console.log('Set selectedMode to:', this.selectedMode?.title);
          
          // Force change detection to update the UI immediately
          this.cdr.detectChanges();
          
          // Also force the textarea to update by triggering a focus event
          setTimeout(() => {
            this.validateCurrentSchema();
            this.cdr.detectChanges();
            
            // Force UI refresh by triggering textarea update
            const textarea = document.querySelector('.json-textarea') as HTMLTextAreaElement;
            if (textarea) {
              textarea.value = this.schemaJSON;
              textarea.dispatchEvent(new Event('input'));
            }
          }, 100);
        },
        error: (error) => {
          console.error('Failed to load schema from registry:', error);
        }
      });
  }

  // Template Loading  
  private loadFromTemplate(templateId: string): void {
    const template = this.schemaTemplates.find(t => t.id === templateId);
    if (template) {
      this.globalState.loadFromTemplate(templateId, template.schema);
      this.selectTemplate(template);
    }
  }

  // File Upload Handler
  private handleFileUpload(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event: any) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          try {
            const schema = JSON.parse(e.target.result);
            this.globalState.loadSchema(schema);
            this.selectMode(this.availableModes[0]); // Create mode
          } catch (error) {
            alert('Invalid JSON file');
          }
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  // URL Import Handler
  private handleUrlImport(): void {
    const url = prompt('Enter schema URL:');
    if (url) {
      fetch(url)
        .then(response => response.json())
        .then(schema => {
          this.globalState.loadSchema(schema);
          this.selectMode(this.availableModes[0]); // Create mode
        })
        .catch(error => {
          alert('Failed to load schema from URL: ' + error.message);
        });
    }
  }

  // Property Management
  onPropertyChange(propertyPath: string, property: SchemaProperty): void {
    this.globalState.updateSchemaProperty(propertyPath, property);
  }

  onDeleteProperty(propertyPath: string): void {
    this.globalState.removeProperty(propertyPath);
  }

  addRootProperty(): void {
    const newProperty: SchemaProperty = {
      id: `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: 'newProperty',
      type: PropertyType.STRING,
      required: false,
      validationRules: []
    };
    
    this.globalState.addProperty(null, newProperty);
  }

  // UI State Management
  toggleDiagram(): void {
    this.globalState.toggleDiagram();
  }

  showPreviewTab(tab: 'formatted' | 'example'): void {
    this.previewTab = tab;
    this.showPreview = true;
    this.globalState.state().showDiagram && this.globalState.toggleDiagram();
  }

  showDiagramTab(): void {
    this.globalState.toggleDiagram();
    this.showPreview && (this.showPreview = false);
  }

  closePreviews(): void {
    this.showPreview = false;
    if (this.globalState.state().showDiagram) {
      this.globalState.toggleDiagram();
    }
  }

  // Enhanced Editor Actions
  importExample(): void {
    const exampleJson = prompt('Paste example JSON data:');
    if (exampleJson) {
      try {
        const example = JSON.parse(exampleJson);
        const generatedSchema = this.generateSchemaFromExample(example);
        this.globalState.loadSchema(generatedSchema);
      } catch (error) {
        alert('Invalid JSON format');
      }
    }
  }

  private generateSchemaFromExample(example: any): JsonSchema {
    const schema: JsonSchema = {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: PropertyType.OBJECT,
      title: 'Generated from Example',
      properties: {},
      required: []
    };

    if (typeof example === 'object' && example !== null) {
      Object.keys(example).forEach(key => {
        const value = example[key];
        const type = this.getTypeFromValue(value);
        
        (schema.properties as any)[key] = {
          type: type,
          description: `Auto-generated from example`
        };
      });
    }

    return schema;
  }

  private getTypeFromValue(value: any): PropertyType {
    if (typeof value === 'string') return PropertyType.STRING;
    if (typeof value === 'number') return Number.isInteger(value) ? PropertyType.INTEGER : PropertyType.NUMBER;
    if (typeof value === 'boolean') return PropertyType.BOOLEAN;
    if (Array.isArray(value)) return PropertyType.ARRAY;
    if (typeof value === 'object' && value !== null) return PropertyType.OBJECT;
    return PropertyType.STRING;
  }
}