import { Injectable, signal, computed, effect } from '@angular/core';
import { BehaviorSubject, Observable, combineLatest } from 'rxjs';
import { JsonSchema, SchemaProperty, PropertyType } from '../models/schema.models';
import { SchemaVersion, CompatibilityLevel } from '../models/schema-registry.models';

export interface GlobalSchemaState {
  // Core schema data
  schema: JsonSchema | null;
  properties: SchemaProperty[];
  
  // Metadata
  subjectName: string | null;
  version: number | null;
  isModified: boolean;
  
  // Registry information
  compatibilityLevel: CompatibilityLevel | null;
  registryMetadata: any | null;
  
  // Editor state
  activeMode: 'create' | 'edit' | 'evolve' | null;
  selectedTemplate: string | null;
  
  // Validation state
  isValid: boolean;
  validationErrors: any[];
  
  // UI state
  showPreview: boolean;
  showDiagram: boolean;
  selectedPropertyPath: string | null;
}

@Injectable({
  providedIn: 'root'
})
export class GlobalSchemaStateService {
  // Core state using Angular signals for reactive updates
  private _state = signal<GlobalSchemaState>({
    schema: null,
    properties: [],
    subjectName: null,
    version: null,
    isModified: false,
    compatibilityLevel: null,
    registryMetadata: null,
    activeMode: null,
    selectedTemplate: null,
    isValid: false,
    validationErrors: [],
    showPreview: false,
    showDiagram: false,
    selectedPropertyPath: null
  });

  // Legacy observables for compatibility with existing services
  private schemaSubject = new BehaviorSubject<JsonSchema | null>(null);
  private propertiesSubject = new BehaviorSubject<SchemaProperty[]>([]);
  private modifiedSubject = new BehaviorSubject<boolean>(false);

  // Public reactive state
  state = this._state.asReadonly();
  
  // Computed values
  hasSchema = computed(() => this._state().schema !== null);
  canSave = computed(() => this._state().isModified && this._state().isValid);
  schemaTitle = computed(() => this._state().schema?.title || 'Untitled Schema');
  propertyCount = computed(() => this._state().properties.length);
  
  // Observable streams for backward compatibility
  schema$ = this.schemaSubject.asObservable();
  properties$ = this.propertiesSubject.asObservable();
  isModified$ = this.modifiedSubject.asObservable();

  constructor() {
    // Sync signals with legacy observables
    effect(() => {
      const state = this._state();
      this.schemaSubject.next(state.schema);
      this.propertiesSubject.next(state.properties);
      this.modifiedSubject.next(state.isModified);
    });
  }

  // Schema Management
  loadSchema(schema: JsonSchema, metadata?: {
    subjectName?: string;
    version?: number;
    compatibilityLevel?: CompatibilityLevel;
    registryMetadata?: any;
  }): void {
    const properties = this.extractPropertiesFromSchema(schema);
    
    this._state.update(state => ({
      ...state,
      schema,
      properties,
      subjectName: metadata?.subjectName || null,
      version: metadata?.version || null,
      compatibilityLevel: metadata?.compatibilityLevel || null,
      registryMetadata: metadata?.registryMetadata || null,
      activeMode: metadata?.subjectName ? 'edit' : 'create',
      isModified: false,
      validationErrors: [],
      isValid: true
    }));
  }

  updateSchema(updates: Partial<JsonSchema>): void {
    this._state.update(state => {
      if (!state.schema) return state;
      
      const updatedSchema = { ...state.schema, ...updates };
      
      return {
        ...state,
        schema: updatedSchema,
        isModified: true
      };
    });
  }

  updateSchemaProperty(propertyPath: string, property: SchemaProperty): void {
    this._state.update(state => {
      const updatedProperties = this.updatePropertyInTree(state.properties, propertyPath, property);
      const updatedSchema = this.buildSchemaFromProperties(state.schema, updatedProperties);
      
      return {
        ...state,
        properties: updatedProperties,
        schema: updatedSchema,
        isModified: true
      };
    });
  }

  addProperty(parentPath: string | null, property: SchemaProperty): void {
    this._state.update(state => {
      const updatedProperties = this.addPropertyToTree(state.properties, parentPath, property);
      const updatedSchema = this.buildSchemaFromProperties(state.schema, updatedProperties);
      
      return {
        ...state,
        properties: updatedProperties,
        schema: updatedSchema,
        isModified: true
      };
    });
  }

  removeProperty(propertyPath: string): void {
    this._state.update(state => {
      const updatedProperties = this.removePropertyFromTree(state.properties, propertyPath);
      const updatedSchema = this.buildSchemaFromProperties(state.schema, updatedProperties);
      
      return {
        ...state,
        properties: updatedProperties,
        schema: updatedSchema,
        isModified: true
      };
    });
  }

  // Template Management
  loadFromTemplate(templateId: string, schema: JsonSchema): void {
    this.loadSchema(schema);
    
    this._state.update(state => ({
      ...state,
      selectedTemplate: templateId,
      activeMode: 'create'
    }));
  }

  // Registry Integration
  loadFromRegistry(subjectName: string, version: SchemaVersion, compatibilityLevel?: CompatibilityLevel): void {
    let parsedSchema: JsonSchema;
    
    try {
      parsedSchema = JSON.parse(version.schema) as JsonSchema;
    } catch (error) {
      console.error('Failed to parse schema from registry:', error);
      return;
    }
    
    this.loadSchema(parsedSchema, {
      subjectName,
      version: version.version,
      compatibilityLevel,
      registryMetadata: {
        id: version.id,
        createdAt: version.createdAt,
        subject: version.subject,
        schemaType: version.schemaType,
        metadata: version.metadata
      }
    });
    
    this._state.update(state => ({
      ...state,
      activeMode: 'edit'
    }));
  }

  // Evolution Mode
  startEvolution(baseSchema: JsonSchema, metadata: any): void {
    this.loadSchema(baseSchema, metadata);
    
    this._state.update(state => ({
      ...state,
      activeMode: 'evolve'
    }));
  }

  // Validation
  updateValidation(isValid: boolean, errors: any[] = []): void {
    this._state.update(state => ({
      ...state,
      isValid,
      validationErrors: errors
    }));
  }

  // UI State Management
  togglePreview(): void {
    this._state.update(state => ({
      ...state,
      showPreview: !state.showPreview
    }));
  }

  toggleDiagram(): void {
    this._state.update(state => ({
      ...state,
      showDiagram: !state.showDiagram
    }));
  }

  selectProperty(propertyPath: string | null): void {
    this._state.update(state => ({
      ...state,
      selectedPropertyPath: propertyPath
    }));
  }

  // Save Operations
  markAsSaved(): void {
    this._state.update(state => ({
      ...state,
      isModified: false
    }));
  }

  // Reset/Clear
  resetState(): void {
    this._state.set({
      schema: null,
      properties: [],
      subjectName: null,
      version: null,
      isModified: false,
      compatibilityLevel: null,
      registryMetadata: null,
      activeMode: null,
      selectedTemplate: null,
      isValid: false,
      validationErrors: [],
      showPreview: false,
      showDiagram: false,
      selectedPropertyPath: null
    });
  }

  // Helper Methods
  private extractPropertiesFromSchema(schema: JsonSchema): SchemaProperty[] {
    const properties: SchemaProperty[] = [];
    
    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, prop]) => {
        properties.push(this.convertToSchemaProperty(key, prop));
      });
    }
    
    return properties;
  }

  private convertToSchemaProperty(name: string, prop: any, id?: string): SchemaProperty {
    return {
      id: id || `prop_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      type: prop.type as PropertyType || PropertyType.STRING,
      title: prop.title,
      description: prop.description,
      required: false, // Will be set based on schema's required array
      defaultValue: prop.default,
      validationRules: [],
      format: prop.format,
      minimum: prop.minimum,
      maximum: prop.maximum,
      minLength: prop.minLength,
      maxLength: prop.maxLength,
      pattern: prop.pattern,
      enum: prop.enum,
      properties: prop.properties ? 
        Object.entries(prop.properties).reduce((acc, [k, v]) => {
          acc[k] = this.convertToSchemaProperty(k, v);
          return acc;
        }, {} as { [key: string]: SchemaProperty }) : undefined,
      items: prop.items ? this.convertToSchemaProperty('items', prop.items) : undefined
    };
  }

  private updatePropertyInTree(properties: SchemaProperty[], path: string, updatedProperty: SchemaProperty): SchemaProperty[] {
    // Implementation for updating a property in the tree structure
    // This would traverse the property tree and update the specific property
    const pathParts = path.split('.');
    return this.updatePropertyRecursive(properties, pathParts, 0, updatedProperty);
  }

  private updatePropertyRecursive(
    properties: SchemaProperty[], 
    pathParts: string[], 
    depth: number, 
    updatedProperty: SchemaProperty
  ): SchemaProperty[] {
    if (depth >= pathParts.length) return properties;
    
    return properties.map(prop => {
      if (prop.name === pathParts[depth]) {
        if (depth === pathParts.length - 1) {
          // This is the property to update
          return updatedProperty;
        } else {
          // Continue traversing
          const updatedProps = prop.properties ? 
            Object.entries(prop.properties).reduce((acc, [k, v]) => {
              acc[k] = v;
              return acc;
            }, {} as { [key: string]: SchemaProperty }) : {};
          
          const updatedNestedProps = this.updatePropertyRecursive(
            Object.values(updatedProps), 
            pathParts, 
            depth + 1, 
            updatedProperty
          );
          
          return {
            ...prop,
            properties: updatedNestedProps.reduce((acc, p) => {
              acc[p.name] = p;
              return acc;
            }, {} as { [key: string]: SchemaProperty })
          };
        }
      }
      return prop;
    });
  }

  private addPropertyToTree(properties: SchemaProperty[], parentPath: string | null, property: SchemaProperty): SchemaProperty[] {
    if (!parentPath) {
      return [...properties, property];
    }
    
    // Implementation for adding to nested properties
    return properties; // Simplified for now
  }

  private removePropertyFromTree(properties: SchemaProperty[], path: string): SchemaProperty[] {
    const pathParts = path.split('.');
    return this.removePropertyRecursive(properties, pathParts, 0);
  }

  private removePropertyRecursive(properties: SchemaProperty[], pathParts: string[], depth: number): SchemaProperty[] {
    if (depth >= pathParts.length) return properties;
    
    if (depth === pathParts.length - 1) {
      // Remove the property at this level
      return properties.filter(prop => prop.name !== pathParts[depth]);
    }
    
    // Continue traversing
    return properties.map(prop => {
      if (prop.name === pathParts[depth] && prop.properties) {
        const updatedNestedProps = this.removePropertyRecursive(
          Object.values(prop.properties), 
          pathParts, 
          depth + 1
        );
        
        return {
          ...prop,
          properties: updatedNestedProps.reduce((acc, p) => {
            acc[p.name] = p;
            return acc;
          }, {} as { [key: string]: SchemaProperty })
        };
      }
      return prop;
    });
  }

  private buildSchemaFromProperties(baseSchema: JsonSchema | null, properties: SchemaProperty[]): JsonSchema {
    const schema: JsonSchema = baseSchema || {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      type: PropertyType.OBJECT,
      title: 'New Schema',
      properties: {},
      required: []
    };

    // Build properties object from property tree
    const builtProperties: { [key: string]: any } = {};
    const requiredFields: string[] = [];

    properties.forEach(prop => {
      builtProperties[prop.name] = this.buildPropertyDefinition(prop);
      if (prop.required) {
        requiredFields.push(prop.name);
      }
    });

    return {
      ...schema,
      properties: builtProperties,
      required: requiredFields
    };
  }

  private buildPropertyDefinition(property: SchemaProperty): any {
    const propDef: any = {
      type: property.type
    };

    if (property.title) propDef.title = property.title;
    if (property.description) propDef.description = property.description;
    if (property.defaultValue !== undefined) propDef.default = property.defaultValue;
    if (property.format) propDef.format = property.format;
    if (property.minimum !== undefined) propDef.minimum = property.minimum;
    if (property.maximum !== undefined) propDef.maximum = property.maximum;
    if (property.minLength !== undefined) propDef.minLength = property.minLength;
    if (property.maxLength !== undefined) propDef.maxLength = property.maxLength;
    if (property.pattern) propDef.pattern = property.pattern;
    if (property.enum && property.enum.length > 0) propDef.enum = property.enum;

    // Handle nested properties for objects
    if (property.type === PropertyType.OBJECT && property.properties) {
      propDef.properties = {};
      const nestedRequired: string[] = [];

      Object.values(property.properties).forEach(nestedProp => {
        propDef.properties[nestedProp.name] = this.buildPropertyDefinition(nestedProp);
        if (nestedProp.required) {
          nestedRequired.push(nestedProp.name);
        }
      });

      if (nestedRequired.length > 0) {
        propDef.required = nestedRequired;
      }
    }

    // Handle array items
    if (property.type === PropertyType.ARRAY && property.items) {
      propDef.items = this.buildPropertyDefinition(property.items);
    }

    return propDef;
  }

  // Utility getters for backward compatibility
  getCurrentSchema(): JsonSchema | null {
    return this._state().schema;
  }

  getCurrentProperties(): SchemaProperty[] {
    return this._state().properties;
  }

  isSchemaModified(): boolean {
    return this._state().isModified;
  }

  getSubjectName(): string | null {
    return this._state().subjectName;
  }

  getActiveMode(): 'create' | 'edit' | 'evolve' | null {
    return this._state().activeMode;
  }
}