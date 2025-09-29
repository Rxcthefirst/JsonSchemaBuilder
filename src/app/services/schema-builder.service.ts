import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { 
  SchemaProperty, 
  JsonSchema, 
  PropertyType, 
  SchemaFormData,
  ValidationRule,
  SchemaConfiguration,
  DEFAULT_SCHEMA_CONFIG
} from '../models/schema.models';

@Injectable({
  providedIn: 'root'
})
export class SchemaBuilderService {
  private schemaSubject = new BehaviorSubject<JsonSchema>(this.createEmptySchema());
  private propertiesSubject = new BehaviorSubject<SchemaProperty[]>([]);
  private configurationSubject = new BehaviorSubject<SchemaConfiguration>(DEFAULT_SCHEMA_CONFIG);

  public schema$ = this.schemaSubject.asObservable();
  public properties$ = this.propertiesSubject.asObservable();
  public configuration$ = this.configurationSubject.asObservable();

  constructor() { }

  createEmptySchema(): JsonSchema {
    return {
      $schema: 'https://json-schema.org/draft/2020-12/schema',
      title: 'New Schema',
      description: '',
      type: PropertyType.OBJECT,
      properties: {},
      required: [],
      additionalProperties: true
    };
  }

  createEmptyProperty(name: string = 'newProperty'): SchemaProperty {
    return {
      id: this.generateId(),
      name: name,
      type: PropertyType.STRING,
      title: '',
      description: '',
      required: false,
      validationRules: [],
      defaultValue: undefined
    };
  }

  generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  // Configuration management
  updateConfiguration(config: Partial<SchemaConfiguration>): void {
    const currentConfig = this.configurationSubject.value;
    const newConfig = { ...currentConfig, ...config };
    this.configurationSubject.next(newConfig);
    
    // Regenerate schema with new configuration
    this.regenerateJsonSchema();
  }

  getConfiguration(): SchemaConfiguration {
    return this.configurationSubject.value;
  }

  updateSchema(updates: Partial<JsonSchema>): void {
    const currentSchema = this.schemaSubject.value;
    const updatedSchema = { ...currentSchema, ...updates };
    this.schemaSubject.next(updatedSchema);
    this.regenerateJsonSchema();
  }

  addProperty(property: SchemaProperty): void {
    const currentProperties = this.propertiesSubject.value;
    const updatedProperties = [...currentProperties, property];
    this.propertiesSubject.next(updatedProperties);
    this.regenerateJsonSchema();
  }

  updateProperty(propertyId: string, updates: Partial<SchemaProperty>): void {
    const currentProperties = this.propertiesSubject.value;
    const updatedProperties = currentProperties.map(prop =>
      prop.id === propertyId ? { ...prop, ...updates } : prop
    );
    this.propertiesSubject.next(updatedProperties);
    this.regenerateJsonSchema();
  }

  removeProperty(propertyId: string): void {
    const currentProperties = this.propertiesSubject.value;
    const updatedProperties = currentProperties.filter(prop => prop.id !== propertyId);
    this.propertiesSubject.next(updatedProperties);
    this.regenerateJsonSchema();
  }

  duplicateProperty(propertyId: string): void {
    const currentProperties = this.propertiesSubject.value;
    const propertyToDuplicate = currentProperties.find(prop => prop.id === propertyId);
    
    if (propertyToDuplicate) {
      const duplicatedProperty: SchemaProperty = {
        ...propertyToDuplicate,
        id: this.generateId(),
        name: `${propertyToDuplicate.name}_copy`
      };
      this.addProperty(duplicatedProperty);
    }
  }

  moveProperty(fromIndex: number, toIndex: number): void {
    const currentProperties = [...this.propertiesSubject.value];
    const [removed] = currentProperties.splice(fromIndex, 1);
    currentProperties.splice(toIndex, 0, removed);
    this.propertiesSubject.next(currentProperties);
    this.regenerateJsonSchema();
  }

  setRequiredProperty(propertyName: string, isRequired: boolean): void {
    const currentSchema = this.schemaSubject.value;
    let required = currentSchema.required || [];
    
    if (isRequired && !required.includes(propertyName)) {
      required = [...required, propertyName];
    } else if (!isRequired && required.includes(propertyName)) {
      required = required.filter(name => name !== propertyName);
    }
    
    this.updateSchema({ required });
  }

  addValidationRule(propertyId: string, rule: ValidationRule): void {
    const currentProperties = this.propertiesSubject.value;
    const updatedProperties = currentProperties.map(prop => {
      if (prop.id === propertyId) {
        return {
          ...prop,
          validationRules: [...prop.validationRules, rule]
        };
      }
      return prop;
    });
    this.propertiesSubject.next(updatedProperties);
    this.regenerateJsonSchema();
  }

  removeValidationRule(propertyId: string, ruleIndex: number): void {
    const currentProperties = this.propertiesSubject.value;
    const updatedProperties = currentProperties.map(prop => {
      if (prop.id === propertyId) {
        const updatedRules = [...prop.validationRules];
        updatedRules.splice(ruleIndex, 1);
        return {
          ...prop,
          validationRules: updatedRules
        };
      }
      return prop;
    });
    this.propertiesSubject.next(updatedProperties);
    this.regenerateJsonSchema();
  }

  loadFromJsonSchema(jsonSchema: string): boolean {
    try {
      const parsed = JSON.parse(jsonSchema);
      const schema = this.convertJsonSchemaToModel(parsed);
      this.schemaSubject.next(schema);
      
      // Extract properties from the schema
      const properties = this.extractPropertiesFromSchema(parsed);
      this.propertiesSubject.next(properties);
      
      return true;
    } catch (error) {
      console.error('Invalid JSON schema:', error);
      return false;
    }
  }

  private convertJsonSchemaToModel(jsonSchema: any): JsonSchema {
    return {
      $schema: jsonSchema.$schema || 'https://json-schema.org/draft/2020-12/schema',
      $id: jsonSchema.$id,
      title: jsonSchema.title || 'Imported Schema',
      description: jsonSchema.description || '',
      type: jsonSchema.type || PropertyType.OBJECT,
      properties: jsonSchema.properties || {},
      required: jsonSchema.required || [],
      additionalProperties: jsonSchema.additionalProperties !== false
    };
  }

  private extractPropertiesFromSchema(jsonSchema: any): SchemaProperty[] {
    const properties: SchemaProperty[] = [];
    
    if (jsonSchema.properties) {
      Object.keys(jsonSchema.properties).forEach(key => {
        const prop = jsonSchema.properties[key];
        properties.push(this.convertPropertyFromJsonSchema(key, prop, jsonSchema.required || []));
      });
    }
    
    return properties;
  }

  private convertPropertyFromJsonSchema(name: string, prop: any, required: string[]): SchemaProperty {
    return {
      id: this.generateId(),
      name: name,
      type: prop.type || PropertyType.STRING,
      title: prop.title || '',
      description: prop.description || '',
      required: required.includes(name),
      defaultValue: prop.default,
      validationRules: this.extractValidationRules(prop),
      minLength: prop.minLength,
      maxLength: prop.maxLength,
      pattern: prop.pattern,
      format: prop.format,
      minimum: prop.minimum,
      maximum: prop.maximum,
      exclusiveMinimum: prop.exclusiveMinimum,
      exclusiveMaximum: prop.exclusiveMaximum,
      multipleOf: prop.multipleOf,
      minItems: prop.minItems,
      maxItems: prop.maxItems,
      uniqueItems: prop.uniqueItems,
      minProperties: prop.minProperties,
      maxProperties: prop.maxProperties,
      additionalProperties: prop.additionalProperties,
      enum: prop.enum,
      items: prop.items ? this.convertPropertyFromJsonSchema('items', prop.items, []) : undefined,
      properties: prop.properties ? this.convertObjectProperties(prop.properties, prop.required || []) : undefined
    };
  }

  private convertObjectProperties(properties: any, required: string[]): { [key: string]: SchemaProperty } {
    const result: { [key: string]: SchemaProperty } = {};
    Object.keys(properties).forEach(key => {
      result[key] = this.convertPropertyFromJsonSchema(key, properties[key], required);
    });
    return result;
  }

  private extractValidationRules(prop: any): ValidationRule[] {
    const rules: ValidationRule[] = [];
    
    // Add validation rules based on property constraints
    if (prop.minLength !== undefined) {
      rules.push({ type: 'minLength', value: prop.minLength });
    }
    if (prop.maxLength !== undefined) {
      rules.push({ type: 'maxLength', value: prop.maxLength });
    }
    if (prop.pattern !== undefined) {
      rules.push({ type: 'pattern', value: prop.pattern });
    }
    // Add more validation rules as needed...
    
    return rules;
  }

  private regenerateJsonSchema(): void {
    const currentSchema = this.schemaSubject.value;
    const currentProperties = this.propertiesSubject.value;
    const config = this.configurationSubject.value;
    
    // Convert properties array to properties object
    const propertiesObject: { [key: string]: any } = {};
    const requiredProperties: string[] = [];
    const definitions: { [key: string]: any } = {};
    
    currentProperties.forEach(prop => {
      const converted = this.convertPropertyToJsonSchema(prop, config, definitions);
      propertiesObject[prop.name] = converted;
      if (prop.required) {
        requiredProperties.push(prop.name);
      }
    });
    
    const updatedSchema: JsonSchema = {
      ...currentSchema,
      properties: propertiesObject,
      required: requiredProperties
    };
    
    // Add definitions if using references and definitions were created
    if (config.useReferences && Object.keys(definitions).length > 0) {
      updatedSchema.definitions = definitions;
    }
    
    this.schemaSubject.next(updatedSchema);
  }

  private convertPropertyToJsonSchema(prop: SchemaProperty, config?: SchemaConfiguration, definitions?: { [key: string]: any }, depth: number = 0): any {
    // Handle $ref if explicitly set
    if (prop.$ref) {
      return { $ref: prop.$ref };
    }
    
    // Always create references when useReferences is enabled for objects and arrays
    const shouldCreateRef = config?.useReferences && 
                           (prop.type === PropertyType.OBJECT || prop.type === PropertyType.ARRAY) &&
                           this.shouldUseReference(prop);
    
    if (shouldCreateRef && definitions) {
      const refName = this.generateDefinitionName(prop, depth, definitions);
      // Avoid circular references
      if (!definitions[refName]) {
        definitions[refName] = this.buildPropertyDefinition(prop, config, definitions, depth);
      }
      return { $ref: `#/definitions/${refName}` };
    }
    
    return this.buildPropertyDefinition(prop, config, definitions, depth);
  }
  
  private shouldUseReference(prop: SchemaProperty): boolean {
    // Always use references for objects and arrays when references are enabled
    // This ensures consistent $ref usage regardless of whether they have content yet
    return prop.type === PropertyType.OBJECT || prop.type === PropertyType.ARRAY;
  }

  private buildPropertyDefinition(prop: SchemaProperty, config?: SchemaConfiguration, definitions?: { [key: string]: any }, depth: number = 0, allowNestedRefs: boolean = true): any {
    const jsonProp: any = {
      type: prop.type,
    };
    
    if (prop.title) jsonProp.title = prop.title;
    if (prop.description) jsonProp.description = prop.description;
    if (prop.defaultValue !== undefined) jsonProp.default = prop.defaultValue;
    if (prop.enum && prop.enum.length > 0) jsonProp.enum = prop.enum;
    
    // String constraints
    if (prop.minLength !== undefined) jsonProp.minLength = prop.minLength;
    if (prop.maxLength !== undefined) jsonProp.maxLength = prop.maxLength;
    if (prop.pattern) jsonProp.pattern = prop.pattern;
    if (prop.format) jsonProp.format = prop.format;
    
    // Number constraints
    if (prop.minimum !== undefined) jsonProp.minimum = prop.minimum;
    if (prop.maximum !== undefined) jsonProp.maximum = prop.maximum;
    if (prop.exclusiveMinimum !== undefined) jsonProp.exclusiveMinimum = prop.exclusiveMinimum;
    if (prop.exclusiveMaximum !== undefined) jsonProp.exclusiveMaximum = prop.exclusiveMaximum;
    if (prop.multipleOf !== undefined) jsonProp.multipleOf = prop.multipleOf;
    
    // Array constraints
    if (prop.minItems !== undefined) jsonProp.minItems = prop.minItems;
    if (prop.maxItems !== undefined) jsonProp.maxItems = prop.maxItems;
    if (prop.uniqueItems !== undefined) jsonProp.uniqueItems = prop.uniqueItems;
    
    // Handle array items - always use references recursively when enabled
    if (prop.items) {
      jsonProp.items = this.convertPropertyToJsonSchema(prop.items, config, definitions, depth + 1);
    }
    
    // Object constraints
    if (prop.minProperties !== undefined) jsonProp.minProperties = prop.minProperties;
    if (prop.maxProperties !== undefined) jsonProp.maxProperties = prop.maxProperties;
    if (prop.additionalProperties !== undefined) jsonProp.additionalProperties = prop.additionalProperties;
    
    // Handle object properties - always use references recursively when enabled
    if (prop.properties) {
      jsonProp.properties = {};
      Object.keys(prop.properties).forEach(key => {
        jsonProp.properties[key] = this.convertPropertyToJsonSchema(prop.properties![key], config, definitions, depth + 1);
      });
    }
    
    return jsonProp;
  }

  private generateDefinitionName(prop: SchemaProperty, depth: number, definitions?: { [key: string]: any }): string {
    // Generate a meaningful definition name based on property characteristics
    let baseName = prop.title || prop.name || prop.type;
    baseName = baseName.replace(/[^a-zA-Z0-9]/g, '');
    
    // Make first letter uppercase for definition names
    baseName = baseName.charAt(0).toUpperCase() + baseName.slice(1);
    
    // Add type suffix to make the definition name clear
    if (prop.type === PropertyType.OBJECT) {
      if (!baseName.toLowerCase().includes('object')) {
        baseName += 'Object';
      }
    } else if (prop.type === PropertyType.ARRAY) {
      if (!baseName.toLowerCase().includes('array')) {
        baseName += 'Array';
      }
    }
    
    // Ensure we have a valid name
    if (!baseName || baseName.length === 0) {
      baseName = prop.type.charAt(0).toUpperCase() + prop.type.slice(1) + 'Definition';
    }
    
    // Handle name collisions by adding a suffix
    let finalName = baseName;
    let counter = 1;
    while (definitions && definitions[finalName]) {
      finalName = `${baseName}${counter}`;
      counter++;
    }
    
    return finalName;
  }

  getCurrentSchema(): JsonSchema {
    return this.schemaSubject.value;
  }

  getCurrentProperties(): SchemaProperty[] {
    return this.propertiesSubject.value;
  }

  exportAsJson(): string {
    return JSON.stringify(this.schemaSubject.value, null, 2);
  }

  resetSchema(): void {
    this.schemaSubject.next(this.createEmptySchema());
    this.propertiesSubject.next([]);
  }
}