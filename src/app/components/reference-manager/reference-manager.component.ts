import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchemaProperty, PropertyType } from '../../models/schema.models';

interface Definition {
  id: string;
  name: string;
  schema: SchemaProperty;
  usageCount: number;
  description?: string;
}

interface Reference {
  path: string;
  targetDefinition: string;
  property: SchemaProperty;
}

@Component({
  selector: 'app-reference-manager',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './reference-manager.component.html',
  styleUrls: ['./reference-manager.component.scss']
})
export class ReferenceManagerComponent implements OnInit, OnChanges {
  @Input() definitions: { [key: string]: SchemaProperty } = {};
  @Input() currentProperty: SchemaProperty | null = null;
  @Input() currentDraft: string = 'draft-07';
  @Input() rootSchema: SchemaProperty | null = null;
  
  @Output() definitionsChange = new EventEmitter<{ [key: string]: SchemaProperty }>();
  @Output() propertyRefUpdate = new EventEmitter<{ property: SchemaProperty; ref: string }>();

  PropertyType = PropertyType;
  
  // UI State
  activeTab: 'definitions' | 'references' | 'browser' = 'definitions';
  selectedDefinition: string | null = null;
  
  // Definitions management
  definitionsList: Definition[] = [];
  newDefinitionName: string = '';
  newDefinitionType: PropertyType = PropertyType.OBJECT;
  
  // Reference browsing
  availableReferences: string[] = [];
  referenceFilter: string = '';
  
  // Reference usage tracking
  referenceUsages: Reference[] = [];
  
  // Schema creation templates
  commonSchemaTemplates = [
    { 
      name: 'Address', 
      type: PropertyType.OBJECT,
      schema: {
        id: Math.random().toString(36).substr(2, 9),
        name: 'Address',
        type: PropertyType.OBJECT,
        description: 'A standard address schema',
        required: false,
        validationRules: [],
        properties: {
          street: {
            id: Math.random().toString(36).substr(2, 9),
            name: 'street',
            type: PropertyType.STRING,
            description: 'Street address',
            required: true,
            validationRules: []
          },
          city: {
            id: Math.random().toString(36).substr(2, 9),
            name: 'city',
            type: PropertyType.STRING,
            description: 'City name',
            required: true,
            validationRules: []
          },
          country: {
            id: Math.random().toString(36).substr(2, 9),
            name: 'country',
            type: PropertyType.STRING,
            description: 'Country name',
            required: true,
            validationRules: []
          },
          postalCode: {
            id: Math.random().toString(36).substr(2, 9),
            name: 'postalCode',
            type: PropertyType.STRING,
            description: 'Postal or ZIP code',
            required: false,
            validationRules: []
          }
        }
      }
    },
    {
      name: 'Person',
      type: PropertyType.OBJECT,
      schema: {
        id: Math.random().toString(36).substr(2, 9),
        name: 'Person',
        type: PropertyType.OBJECT,
        description: 'A person schema',
        required: false,
        validationRules: [],
        properties: {
          firstName: {
            id: Math.random().toString(36).substr(2, 9),
            name: 'firstName',
            type: PropertyType.STRING,
            description: 'First name',
            required: true,
            validationRules: []
          },
          lastName: {
            id: Math.random().toString(36).substr(2, 9),
            name: 'lastName',
            type: PropertyType.STRING,
            description: 'Last name',
            required: true,
            validationRules: []
          },
          email: {
            id: Math.random().toString(36).substr(2, 9),
            name: 'email',
            type: PropertyType.STRING,
            description: 'Email address',
            required: false,
            validationRules: [],
            format: 'email'
          },
          age: {
            id: Math.random().toString(36).substr(2, 9),
            name: 'age',
            type: PropertyType.INTEGER,
            description: 'Age in years',
            required: false,
            validationRules: [],
            minimum: 0,
            maximum: 150
          }
        }
      }
    },
    {
      name: 'DateTime',
      type: PropertyType.STRING,
      schema: {
        id: Math.random().toString(36).substr(2, 9),
        name: 'DateTime',
        type: PropertyType.STRING,
        description: 'ISO 8601 date-time string',
        required: false,
        validationRules: [],
        format: 'date-time',
        pattern: '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{3})?Z?$'
      }
    },
    {
      name: 'UUID',
      type: PropertyType.STRING,
      schema: {
        id: Math.random().toString(36).substr(2, 9),
        name: 'UUID',
        type: PropertyType.STRING,
        description: 'Universally Unique Identifier',
        required: false,
        validationRules: [],
        format: 'uuid',
        pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      }
    }
  ];

  ngOnInit() {
    this.initializeComponent();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['definitions'] || changes['rootSchema']) {
      this.initializeComponent();
    }
  }

  private initializeComponent() {
    this.updateDefinitionsList();
    this.updateAvailableReferences();
    this.analyzeReferenceUsages();
  }

  private updateDefinitionsList() {
    this.definitionsList = Object.keys(this.definitions).map(key => ({
      id: key,
      name: key,
      schema: this.definitions[key],
      usageCount: this.countDefinitionUsages(key),
      description: this.definitions[key].description
    }));
  }

  private updateAvailableReferences() {
    this.availableReferences = Object.keys(this.definitions).map(key => {
      const defPath = this.getDefinitionPath();
      return `${defPath}/${key}`;
    });
  }

  private getDefinitionPath(): string {
    // Draft 2019-09+ uses $defs, older drafts use definitions
    return this.currentDraft === 'draft-2020-12' || this.currentDraft === 'draft-2019-09' 
      ? '#/$defs' 
      : '#/definitions';
  }

  private countDefinitionUsages(definitionName: string): number {
    let count = 0;
    const refPath = `${this.getDefinitionPath()}/${definitionName}`;
    
    if (this.rootSchema) {
      count += this.countReferencesInProperty(this.rootSchema, refPath);
    }
    
    // Count usages in other definitions
    Object.values(this.definitions).forEach(def => {
      count += this.countReferencesInProperty(def, refPath);
    });
    
    return count;
  }

  private countReferencesInProperty(property: SchemaProperty, targetRef: string): number {
    let count = 0;
    
    if (property.$ref === targetRef) {
      count++;
    }
    
    // Check nested properties
    if (property.properties) {
      Object.values(property.properties).forEach(prop => {
        count += this.countReferencesInProperty(prop, targetRef);
      });
    }
    
    // Check array items
    if (property.items && typeof property.items === 'object') {
      count += this.countReferencesInProperty(property.items, targetRef);
    }
    
    // Check composition keywords
    ['allOf', 'anyOf', 'oneOf'].forEach(keyword => {
      const compositions = (property as any)[keyword];
      if (Array.isArray(compositions)) {
        compositions.forEach((comp: SchemaProperty) => {
          count += this.countReferencesInProperty(comp, targetRef);
        });
      }
    });
    
    return count;
  }

  private analyzeReferenceUsages() {
    this.referenceUsages = [];
    
    if (this.rootSchema) {
      this.findReferencesInProperty(this.rootSchema, 'root');
    }
    
    Object.entries(this.definitions).forEach(([defName, def]) => {
      this.findReferencesInProperty(def, `definitions.${defName}`);
    });
  }

  private findReferencesInProperty(property: SchemaProperty, path: string) {
    if (property.$ref) {
      this.referenceUsages.push({
        path,
        targetDefinition: this.extractDefinitionNameFromRef(property.$ref),
        property
      });
    }
    
    // Recursively check nested properties
    if (property.properties) {
      Object.entries(property.properties).forEach(([propName, prop]) => {
        this.findReferencesInProperty(prop, `${path}.${propName}`);
      });
    }
    
    if (property.items && typeof property.items === 'object') {
      this.findReferencesInProperty(property.items, `${path}.items`);
    }
  }

  extractDefinitionNameFromRef(ref: string): string {
    const parts = ref.split('/');
    return parts[parts.length - 1];
  }

  // Tab Management
  setActiveTab(tab: 'definitions' | 'references' | 'browser') {
    this.activeTab = tab;
  }

  // Definition Management
  createDefinition() {
    if (!this.newDefinitionName.trim()) return;
    
    const newDef: SchemaProperty = {
      id: Math.random().toString(36).substr(2, 9),
      name: this.newDefinitionName,
      type: this.newDefinitionType,
      description: `${this.newDefinitionName} definition`,
      required: false,
      validationRules: []
    };
    
    this.definitions[this.newDefinitionName] = newDef;
    this.definitionsChange.emit({ ...this.definitions });
    this.updateDefinitionsList();
    this.newDefinitionName = '';
    
    // Select the new definition
    this.selectDefinition(this.newDefinitionName);
  }

  createFromTemplate(template: any) {
    const name = template.name;
    let counter = 1;
    let finalName = name;
    
    // Ensure unique name
    while (this.definitions[finalName]) {
      finalName = `${name}${counter}`;
      counter++;
    }
    
    this.definitions[finalName] = { ...template.schema, name: finalName };
    this.definitionsChange.emit({ ...this.definitions });
    this.updateDefinitionsList();
    this.selectDefinition(finalName);
  }

  deleteDefinition(defName: string) {
    if (this.countDefinitionUsages(defName) > 0) {
      if (!confirm(`This definition is used in ${this.countDefinitionUsages(defName)} place(s). Delete anyway?`)) {
        return;
      }
    }
    
    delete this.definitions[defName];
    this.definitionsChange.emit({ ...this.definitions });
    this.updateDefinitionsList();
    
    if (this.selectedDefinition === defName) {
      this.selectedDefinition = null;
    }
  }

  selectDefinition(defName: string) {
    this.selectedDefinition = defName;
  }

  updateDefinition(defName: string, updatedSchema: SchemaProperty) {
    this.definitions[defName] = updatedSchema;
    this.definitionsChange.emit({ ...this.definitions });
    this.updateDefinitionsList();
  }

  // Reference Management
  createReference(definitionName: string) {
    if (!this.currentProperty) return;
    
    const refPath = `${this.getDefinitionPath()}/${definitionName}`;
    this.propertyRefUpdate.emit({
      property: this.currentProperty,
      ref: refPath
    });
  }

  getFilteredReferences(): string[] {
    if (!this.referenceFilter.trim()) {
      return this.availableReferences;
    }
    
    const filter = this.referenceFilter.toLowerCase();
    return this.availableReferences.filter(ref => 
      ref.toLowerCase().includes(filter)
    );
  }

  // Utility Methods
  getDefinitionPreview(schema: SchemaProperty): string {
    if (schema.type === PropertyType.OBJECT && schema.properties) {
      const propCount = Object.keys(schema.properties).length;
      return `Object with ${propCount} propert${propCount === 1 ? 'y' : 'ies'}`;
    } else if (schema.type === PropertyType.ARRAY && schema.items) {
      return `Array of ${typeof schema.items === 'object' ? schema.items.type : 'any'}`;
    } else if (schema.enum) {
      return `Enum: ${schema.enum.slice(0, 3).join(', ')}${schema.enum.length > 3 ? '...' : ''}`;
    } else {
      return `${schema.type}${schema.format ? ` (${schema.format})` : ''}`;
    }
  }

  getReferenceStatusBadge(usageCount: number): string {
    if (usageCount === 0) return 'unused';
    if (usageCount === 1) return 'single-use';
    return 'multi-use';
  }

  isDraft2019Plus(): boolean {
    return this.currentDraft === 'draft-2020-12' || this.currentDraft === 'draft-2019-09';
  }

  exportDefinitions(): string {
    return JSON.stringify(this.definitions, null, 2);
  }

  onFileImport(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        this.importDefinitions(content);
      };
      reader.readAsText(file);
    }
  }

  importDefinitions(definitionsJson: string) {
    try {
      const imported = JSON.parse(definitionsJson);
      Object.entries(imported).forEach(([key, value]) => {
        if (this.isValidSchemaProperty(value)) {
          this.definitions[key] = value as SchemaProperty;
        }
      });
      this.definitionsChange.emit({ ...this.definitions });
      this.updateDefinitionsList();
    } catch (error) {
      console.error('Invalid JSON for definitions import', error);
    }
  }

  private isValidSchemaProperty(obj: any): boolean {
    return obj && typeof obj === 'object' && 'type' in obj && 'name' in obj;
  }

  // Helper methods for template
  getUnusedDefinitionsCount(): number {
    return this.definitionsList.filter(d => d.usageCount === 0).length;
  }

  getUnusedDefinitions(): Definition[] {
    return this.definitionsList.filter(d => d.usageCount === 0);
  }
}