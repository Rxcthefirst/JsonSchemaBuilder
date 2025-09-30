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
    const schema: JsonSchema = {
      $schema: jsonSchema.$schema || 'https://json-schema.org/draft/2020-12/schema',
      title: jsonSchema.title || 'Imported Schema'
    };

    // Only set description if it was provided and not empty
    if (jsonSchema.description !== undefined && jsonSchema.description !== '') {
      schema.description = jsonSchema.description;
    }

    // Only set properties if they exist and are not empty
    if (jsonSchema.properties && Object.keys(jsonSchema.properties).length > 0) {
      schema.properties = jsonSchema.properties;
    }

    // Only set required if it exists and is not empty
    if (jsonSchema.required && Array.isArray(jsonSchema.required) && jsonSchema.required.length > 0) {
      schema.required = jsonSchema.required;
    }

    // Only set additionalProperties if it was explicitly provided
    if (jsonSchema.additionalProperties !== undefined) {
      schema.additionalProperties = jsonSchema.additionalProperties;
    }

    // Only set type if it's explicitly provided
    if (jsonSchema.type !== undefined) {
      schema.type = jsonSchema.type;
    }

    // Handle optional root-level properties
    if (jsonSchema.$id !== undefined) schema.$id = jsonSchema.$id;
    if (jsonSchema.$ref !== undefined) schema.$ref = jsonSchema.$ref;
    if (jsonSchema.definitions !== undefined) schema.definitions = jsonSchema.definitions;
    
    // Handle validation properties
    if (jsonSchema.enum !== undefined) schema.enum = jsonSchema.enum;
    if (jsonSchema.const !== undefined) schema.const = jsonSchema.const;
    if (jsonSchema.default !== undefined) schema.default = jsonSchema.default;
    
    // Handle type-specific constraints
    if (jsonSchema.minLength !== undefined) schema.minLength = jsonSchema.minLength;
    if (jsonSchema.maxLength !== undefined) schema.maxLength = jsonSchema.maxLength;
    if (jsonSchema.pattern !== undefined) schema.pattern = jsonSchema.pattern;
    if (jsonSchema.format !== undefined) schema.format = jsonSchema.format;
    if (jsonSchema.contentEncoding !== undefined) schema.contentEncoding = jsonSchema.contentEncoding;
    if (jsonSchema.contentMediaType !== undefined) schema.contentMediaType = jsonSchema.contentMediaType;
    
    if (jsonSchema.minimum !== undefined) schema.minimum = jsonSchema.minimum;
    if (jsonSchema.maximum !== undefined) schema.maximum = jsonSchema.maximum;
    if (jsonSchema.exclusiveMinimum !== undefined) schema.exclusiveMinimum = jsonSchema.exclusiveMinimum;
    if (jsonSchema.exclusiveMaximum !== undefined) schema.exclusiveMaximum = jsonSchema.exclusiveMaximum;
    if (jsonSchema.multipleOf !== undefined) schema.multipleOf = jsonSchema.multipleOf;
    
    if (jsonSchema.minItems !== undefined) schema.minItems = jsonSchema.minItems;
    if (jsonSchema.maxItems !== undefined) schema.maxItems = jsonSchema.maxItems;
    if (jsonSchema.uniqueItems !== undefined) schema.uniqueItems = jsonSchema.uniqueItems;
    if (jsonSchema.items !== undefined) {
      schema.items = this.convertPropertyFromJsonSchema('items', jsonSchema.items, []);
    }
    if (jsonSchema.additionalItems !== undefined) {
      schema.additionalItems = typeof jsonSchema.additionalItems === 'boolean'
        ? jsonSchema.additionalItems
        : this.convertPropertyFromJsonSchema('additionalItems', jsonSchema.additionalItems, []);
    }
    if (jsonSchema.contains !== undefined) {
      schema.contains = this.convertPropertyFromJsonSchema('contains', jsonSchema.contains, []);
    }
    if (jsonSchema.prefixItems !== undefined && Array.isArray(jsonSchema.prefixItems)) {
      schema.prefixItems = jsonSchema.prefixItems.map((item: any, index: number) => 
        this.convertPropertyFromJsonSchema(`prefixItem_${index}`, item, [])
      );
    }
    if (jsonSchema.unevaluatedItems !== undefined) {
      schema.unevaluatedItems = typeof jsonSchema.unevaluatedItems === 'boolean'
        ? jsonSchema.unevaluatedItems
        : this.convertPropertyFromJsonSchema('unevaluatedItems', jsonSchema.unevaluatedItems, []);
    }
    
    if (jsonSchema.minProperties !== undefined) schema.minProperties = jsonSchema.minProperties;
    if (jsonSchema.maxProperties !== undefined) schema.maxProperties = jsonSchema.maxProperties;
    if (jsonSchema.patternProperties !== undefined) {
      schema.patternProperties = {};
      Object.keys(jsonSchema.patternProperties).forEach(pattern => {
        schema.patternProperties![pattern] = this.convertPropertyFromJsonSchema(
          `pattern_${pattern}`, jsonSchema.patternProperties[pattern], []
        );
      });
    }
    if (jsonSchema.propertyNames !== undefined) {
      schema.propertyNames = this.convertPropertyFromJsonSchema('propertyNames', jsonSchema.propertyNames, []);
    }
    if (jsonSchema.dependencies !== undefined) schema.dependencies = jsonSchema.dependencies;
    if (jsonSchema.dependentRequired !== undefined) schema.dependentRequired = jsonSchema.dependentRequired;
    if (jsonSchema.dependentSchemas !== undefined) {
      schema.dependentSchemas = {};
      Object.keys(jsonSchema.dependentSchemas).forEach(key => {
        schema.dependentSchemas![key] = this.convertPropertyFromJsonSchema(
          `dependent_${key}`, jsonSchema.dependentSchemas[key], []
        );
      });
    }
    if (jsonSchema.unevaluatedProperties !== undefined) {
      schema.unevaluatedProperties = typeof jsonSchema.unevaluatedProperties === 'boolean'
        ? jsonSchema.unevaluatedProperties
        : this.convertPropertyFromJsonSchema('unevaluatedProperties', jsonSchema.unevaluatedProperties, []);
    }
    
    // Handle conditional validation
    if (jsonSchema.if !== undefined) {
      schema.if = this.convertPropertyFromJsonSchema('if', jsonSchema.if, []);
    }
    if (jsonSchema.then !== undefined) {
      schema.then = this.convertPropertyFromJsonSchema('then', jsonSchema.then, []);
    }
    if (jsonSchema.else !== undefined) {
      schema.else = this.convertPropertyFromJsonSchema('else', jsonSchema.else, []);
    }
    
    // Handle composition keywords
    if (jsonSchema.allOf !== undefined && Array.isArray(jsonSchema.allOf)) {
      schema.allOf = jsonSchema.allOf.map((item: any, index: number) =>
        this.convertPropertyFromJsonSchema(`allOf_${index}`, item, [])
      );
    }
    if (jsonSchema.anyOf !== undefined && Array.isArray(jsonSchema.anyOf)) {
      schema.anyOf = jsonSchema.anyOf.map((item: any, index: number) =>
        this.convertPropertyFromJsonSchema(`anyOf_${index}`, item, [])
      );
    }
    if (jsonSchema.oneOf !== undefined && Array.isArray(jsonSchema.oneOf)) {
      schema.oneOf = jsonSchema.oneOf.map((item: any, index: number) =>
        this.convertPropertyFromJsonSchema(`oneOf_${index}`, item, [])
      );
    }
    if (jsonSchema.not !== undefined) {
      schema.not = this.convertPropertyFromJsonSchema('not', jsonSchema.not, []);
    }
    
    // Handle annotations
    if (jsonSchema.examples !== undefined && Array.isArray(jsonSchema.examples)) {
      schema.examples = jsonSchema.examples;
    }
    if (jsonSchema.$comment !== undefined) schema.comment = jsonSchema.$comment;
    if (jsonSchema.deprecated !== undefined) schema.deprecated = jsonSchema.deprecated;
    if (jsonSchema.readOnly !== undefined) schema.readOnly = jsonSchema.readOnly;
    if (jsonSchema.writeOnly !== undefined) schema.writeOnly = jsonSchema.writeOnly;

    // Clean up composition keywords to ensure they remain as clean JSON Schema
    this.cleanCompositionKeywordsInSchema(schema);

    return schema;
  }

  /**
   * Cleans composition keywords in a schema to keep them as clean JSON Schema
   * instead of internal SchemaProperty objects
   */
  private cleanCompositionKeywordsInSchema(schema: JsonSchema): void {
    ['allOf', 'anyOf', 'oneOf'].forEach(keyword => {
      if (schema[keyword as keyof JsonSchema] && Array.isArray(schema[keyword as keyof JsonSchema])) {
        const items = schema[keyword as keyof JsonSchema] as any[];
        const cleanedItems = items.map(item => {
          if (item && typeof item === 'object' && item.id && typeof item.name === 'string') {
            // This is an internal SchemaProperty object, convert it back to clean JSON Schema
            return this.convertSchemaPropertyToJsonSchema(item);
          }
          return item; // Already clean JSON Schema
        });
        (schema as any)[keyword] = cleanedItems;
      }
    });
  }

  private extractPropertiesFromSchema(jsonSchema: any): SchemaProperty[] {
    const properties: SchemaProperty[] = [];
    
    // Handle direct properties
    if (jsonSchema.properties) {
      Object.keys(jsonSchema.properties).forEach(key => {
        const prop = jsonSchema.properties[key];
        properties.push(this.convertPropertyFromJsonSchema(key, prop, jsonSchema.required || []));
      });
    }
    
    // Handle properties within composition schemas (allOf, anyOf, oneOf)
    const extractFromComposition = (compositionArray: any[], required: string[] = []) => {
      compositionArray.forEach((item, index) => {
        if (item.properties) {
          Object.keys(item.properties).forEach(key => {
            // Check if property already exists (avoid duplicates)
            const existingIndex = properties.findIndex(p => p.name === key);
            const prop = this.convertPropertyFromJsonSchema(key, item.properties[key], item.required || required);
            
            if (existingIndex >= 0) {
              // Merge properties if it already exists (e.g., from multiple allOf items)
              properties[existingIndex] = this.mergeSchemaProperties(properties[existingIndex], prop);
            } else {
              properties.push(prop);
            }
          });
        }
        
        // Recursively extract from nested compositions
        if (item.allOf) extractFromComposition(item.allOf, item.required || required);
        if (item.anyOf) extractFromComposition(item.anyOf, item.required || required);
        if (item.oneOf) extractFromComposition(item.oneOf, item.required || required);
      });
    };
    
    if (jsonSchema.allOf) extractFromComposition(jsonSchema.allOf, jsonSchema.required || []);
    if (jsonSchema.anyOf) extractFromComposition(jsonSchema.anyOf, jsonSchema.required || []);
    if (jsonSchema.oneOf) extractFromComposition(jsonSchema.oneOf, jsonSchema.required || []);
    
    return properties;
  }

  private convertPropertyFromJsonSchema(name: string, prop: any, required: string[]): SchemaProperty {
    const schemaProperty: SchemaProperty = {
      id: this.generateId(),
      name: name,
      type: prop.type || PropertyType.STRING,
      title: prop.title || '',
      description: prop.description || '',
      required: required.includes(name),
      defaultValue: prop.default,
      validationRules: this.extractValidationRules(prop)
    };

    // Basic validation properties
    if (prop.enum !== undefined) schemaProperty.enum = prop.enum;
    if (prop.const !== undefined) schemaProperty.const = prop.const;
    if (prop.$ref !== undefined) schemaProperty.$ref = prop.$ref;

    // String-specific properties
    if (prop.minLength !== undefined) schemaProperty.minLength = prop.minLength;
    if (prop.maxLength !== undefined) schemaProperty.maxLength = prop.maxLength;
    if (prop.pattern !== undefined) schemaProperty.pattern = prop.pattern;
    if (prop.format !== undefined) schemaProperty.format = prop.format;
    if (prop.contentEncoding !== undefined) schemaProperty.contentEncoding = prop.contentEncoding;
    if (prop.contentMediaType !== undefined) schemaProperty.contentMediaType = prop.contentMediaType;

    // Number/Integer-specific properties
    if (prop.minimum !== undefined) schemaProperty.minimum = prop.minimum;
    if (prop.maximum !== undefined) schemaProperty.maximum = prop.maximum;
    if (prop.exclusiveMinimum !== undefined) schemaProperty.exclusiveMinimum = prop.exclusiveMinimum;
    if (prop.exclusiveMaximum !== undefined) schemaProperty.exclusiveMaximum = prop.exclusiveMaximum;
    if (prop.multipleOf !== undefined) schemaProperty.multipleOf = prop.multipleOf;

    // Array-specific properties
    if (prop.minItems !== undefined) schemaProperty.minItems = prop.minItems;
    if (prop.maxItems !== undefined) schemaProperty.maxItems = prop.maxItems;
    if (prop.uniqueItems !== undefined) schemaProperty.uniqueItems = prop.uniqueItems;
    if (prop.additionalItems !== undefined) {
      schemaProperty.additionalItems = typeof prop.additionalItems === 'boolean' 
        ? prop.additionalItems 
        : this.convertPropertyFromJsonSchema('additionalItems', prop.additionalItems, []);
    }
    if (prop.items !== undefined) {
      schemaProperty.items = this.convertPropertyFromJsonSchema('items', prop.items, []);
    }
    if (prop.contains !== undefined) {
      schemaProperty.contains = this.convertPropertyFromJsonSchema('contains', prop.contains, []);
    }
    // Draft 2020-12 array features
    if (prop.prefixItems !== undefined && Array.isArray(prop.prefixItems)) {
      schemaProperty.prefixItems = prop.prefixItems.map((item: any, index: number) => 
        this.convertPropertyFromJsonSchema(`prefixItem_${index}`, item, [])
      );
    }
    if (prop.unevaluatedItems !== undefined) {
      schemaProperty.unevaluatedItems = typeof prop.unevaluatedItems === 'boolean'
        ? prop.unevaluatedItems
        : this.convertPropertyFromJsonSchema('unevaluatedItems', prop.unevaluatedItems, []);
    }

    // Object-specific properties
    if (prop.minProperties !== undefined) schemaProperty.minProperties = prop.minProperties;
    if (prop.maxProperties !== undefined) schemaProperty.maxProperties = prop.maxProperties;
    if (prop.additionalProperties !== undefined) {
      schemaProperty.additionalProperties = typeof prop.additionalProperties === 'boolean'
        ? prop.additionalProperties
        : this.convertPropertyFromJsonSchema('additionalProperties', prop.additionalProperties, []);
    }
    if (prop.properties !== undefined) {
      schemaProperty.properties = this.convertObjectProperties(prop.properties, prop.required || []);
    }
    if (prop.patternProperties !== undefined) {
      schemaProperty.patternProperties = {};
      Object.keys(prop.patternProperties).forEach(pattern => {
        schemaProperty.patternProperties![pattern] = this.convertPropertyFromJsonSchema(
          `pattern_${pattern}`, prop.patternProperties[pattern], []
        );
      });
    }
    if (prop.propertyNames !== undefined) {
      schemaProperty.propertyNames = this.convertPropertyFromJsonSchema('propertyNames', prop.propertyNames, []);
    }
    // Dependencies (deprecated in favor of dependentRequired/dependentSchemas)
    if (prop.dependencies !== undefined) schemaProperty.dependencies = prop.dependencies;
    if (prop.dependentRequired !== undefined) schemaProperty.dependentRequired = prop.dependentRequired;
    if (prop.dependentSchemas !== undefined) {
      schemaProperty.dependentSchemas = {};
      Object.keys(prop.dependentSchemas).forEach(key => {
        schemaProperty.dependentSchemas![key] = this.convertPropertyFromJsonSchema(
          `dependent_${key}`, prop.dependentSchemas[key], []
        );
      });
    }
    // Draft 2020-12 object features
    if (prop.unevaluatedProperties !== undefined) {
      schemaProperty.unevaluatedProperties = typeof prop.unevaluatedProperties === 'boolean'
        ? prop.unevaluatedProperties
        : this.convertPropertyFromJsonSchema('unevaluatedProperties', prop.unevaluatedProperties, []);
    }

    // Conditional validation (Draft 7+)
    if (prop.if !== undefined) {
      schemaProperty.if = this.convertPropertyFromJsonSchema('if', prop.if, []);
    }
    if (prop.then !== undefined) {
      schemaProperty.then = this.convertPropertyFromJsonSchema('then', prop.then, []);
    }
    if (prop.else !== undefined) {
      schemaProperty.else = this.convertPropertyFromJsonSchema('else', prop.else, []);
    }

    // Composition keywords
    if (prop.allOf !== undefined && Array.isArray(prop.allOf)) {
      schemaProperty.allOf = prop.allOf.map((item: any, index: number) =>
        this.convertPropertyFromJsonSchema(`allOf_${index}`, item, [])
      );
    }
    if (prop.anyOf !== undefined && Array.isArray(prop.anyOf)) {
      schemaProperty.anyOf = prop.anyOf.map((item: any, index: number) =>
        this.convertPropertyFromJsonSchema(`anyOf_${index}`, item, [])
      );
    }
    if (prop.oneOf !== undefined && Array.isArray(prop.oneOf)) {
      schemaProperty.oneOf = prop.oneOf.map((item: any, index: number) =>
        this.convertPropertyFromJsonSchema(`oneOf_${index}`, item, [])
      );
    }
    if (prop.not !== undefined) {
      schemaProperty.not = this.convertPropertyFromJsonSchema('not', prop.not, []);
    }

    // Annotations (Draft 6+)
    if (prop.examples !== undefined && Array.isArray(prop.examples)) {
      schemaProperty.examples = prop.examples;
    }
    if (prop.$comment !== undefined) schemaProperty.comment = prop.$comment;
    if (prop.deprecated !== undefined) schemaProperty.deprecated = prop.deprecated;
    if (prop.readOnly !== undefined) schemaProperty.readOnly = prop.readOnly;
    if (prop.writeOnly !== undefined) schemaProperty.writeOnly = prop.writeOnly;

    return schemaProperty;
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
      ...currentSchema
    };

    // Only set properties if there are any
    if (Object.keys(propertiesObject).length > 0) {
      updatedSchema.properties = propertiesObject;
    } else {
      delete updatedSchema.properties; // Remove empty properties object
    }

    // Only set required if there are required properties
    if (requiredProperties.length > 0) {
      updatedSchema.required = requiredProperties;
    } else {
      delete updatedSchema.required; // Remove empty required array
    }
    
    // Convert root-level composition keywords to clean JSON Schema
    this.cleanRootCompositionKeywords(updatedSchema, config, definitions);
    
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

  /**
   * Cleans root-level composition keywords by converting internal SchemaProperty objects
   * back to clean JSON Schema format
   */
  private cleanRootCompositionKeywords(
    schema: JsonSchema, 
    config?: SchemaConfiguration, 
    definitions?: { [key: string]: any }
  ): void {
    ['allOf', 'anyOf', 'oneOf'].forEach(keyword => {
      if (schema[keyword as keyof JsonSchema] && Array.isArray(schema[keyword as keyof JsonSchema])) {
        const items = schema[keyword as keyof JsonSchema] as any[];
        const cleanedItems = items.map(item => {
          if (item && typeof item === 'object' && item.id && typeof item.name === 'string') {
            // This is an internal SchemaProperty object, convert it to clean JSON Schema
            return this.convertSchemaPropertyToJsonSchema(item, config, definitions);
          }
          return item; // Already clean JSON Schema
        });
        (schema as any)[keyword] = cleanedItems;
      }
    });
  }

  /**
   * Converts a SchemaProperty object back to clean JSON Schema format
   * This is different from buildPropertyDefinition which is for individual properties
   */
  private convertSchemaPropertyToJsonSchema(
    prop: SchemaProperty, 
    config?: SchemaConfiguration, 
    definitions?: { [key: string]: any }
  ): any {
    const jsonSchema: any = {
      type: prop.type
    };

    // Add basic properties
    if (prop.title) jsonSchema.title = prop.title;
    if (prop.description) jsonSchema.description = prop.description;
    if (prop.comment) jsonSchema.$comment = prop.comment;

    // Add validation rules
    prop.validationRules?.forEach(rule => {
      switch (rule.type) {
        case 'pattern':
          jsonSchema.pattern = rule.value;
          break;
        case 'minimum':
          jsonSchema.minimum = rule.value;
          break;
        case 'maximum':
          jsonSchema.maximum = rule.value;
          break;
        case 'minLength':
          jsonSchema.minLength = rule.value;
          break;
        case 'maxLength':
          jsonSchema.maxLength = rule.value;
          break;
        case 'minItems':
          jsonSchema.minItems = rule.value;
          break;
        case 'maxItems':
          jsonSchema.maxItems = rule.value;
          break;
        case 'minProperties':
          jsonSchema.minProperties = rule.value;
          break;
        case 'maxProperties':
          jsonSchema.maxProperties = rule.value;
          break;
        case 'multipleOf':
          jsonSchema.multipleOf = rule.value;
          break;
        case 'exclusiveMinimum':
          jsonSchema.exclusiveMinimum = rule.value;
          break;
        case 'exclusiveMaximum':
          jsonSchema.exclusiveMaximum = rule.value;
          break;
      }
    });

    // Add format
    if (prop.format) jsonSchema.format = prop.format;

    // Add enum
    if (prop.enum && prop.enum.length > 0) {
      jsonSchema.enum = prop.enum;
    }

    // Add const
    if (prop.const !== undefined) {
      jsonSchema.const = prop.const;
    }

    // Add array-specific properties
    if (prop.type === PropertyType.ARRAY) {
      if (prop.items) {
        jsonSchema.items = this.convertSchemaPropertyToJsonSchema(prop.items, config, definitions);
      }
      if (prop.uniqueItems !== undefined) {
        jsonSchema.uniqueItems = prop.uniqueItems;
      }
    }

    // Add object-specific properties
    if (prop.type === PropertyType.OBJECT) {
      if (prop.properties && Object.keys(prop.properties).length > 0) {
        jsonSchema.properties = {};
        const required: string[] = [];
        
        Object.entries(prop.properties).forEach(([key, childProp]) => {
          jsonSchema.properties[key] = this.convertSchemaPropertyToJsonSchema(childProp, config, definitions);
          if (childProp.required) {
            required.push(key);
          }
        });

        if (required.length > 0) {
          jsonSchema.required = required;
        }
      }

      if (prop.additionalProperties !== undefined) {
        jsonSchema.additionalProperties = prop.additionalProperties;
      }
    }

    return jsonSchema;
  }

  private buildPropertyDefinition(prop: SchemaProperty, config?: SchemaConfiguration, definitions?: { [key: string]: any }, depth: number = 0, allowNestedRefs: boolean = true): any {
    const jsonProp: any = {
      type: prop.type,
    };
    
    // Basic properties
    if (prop.title) jsonProp.title = prop.title;
    if (prop.description) jsonProp.description = prop.description;
    if (prop.defaultValue !== undefined) jsonProp.default = prop.defaultValue;
    if (prop.enum && prop.enum.length > 0) jsonProp.enum = prop.enum;
    if (prop.const !== undefined) jsonProp.const = prop.const;
    if (prop.$ref) jsonProp.$ref = prop.$ref;

    // String constraints
    if (prop.minLength !== undefined) jsonProp.minLength = prop.minLength;
    if (prop.maxLength !== undefined) jsonProp.maxLength = prop.maxLength;
    if (prop.pattern) jsonProp.pattern = prop.pattern;
    if (prop.format) jsonProp.format = prop.format;
    if (prop.contentEncoding) jsonProp.contentEncoding = prop.contentEncoding;
    if (prop.contentMediaType) jsonProp.contentMediaType = prop.contentMediaType;

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
    
    // Array items and related
    if (prop.items) {
      jsonProp.items = this.convertPropertyToJsonSchema(prop.items, config, definitions, depth + 1);
    }
    if (prop.additionalItems !== undefined) {
      jsonProp.additionalItems = typeof prop.additionalItems === 'boolean' 
        ? prop.additionalItems 
        : this.convertPropertyToJsonSchema(prop.additionalItems, config, definitions, depth + 1);
    }
    if (prop.contains) {
      jsonProp.contains = this.convertPropertyToJsonSchema(prop.contains, config, definitions, depth + 1);
    }
    // Draft 2020-12 array features
    if (prop.prefixItems && Array.isArray(prop.prefixItems)) {
      jsonProp.prefixItems = prop.prefixItems.map(item => 
        this.convertPropertyToJsonSchema(item, config, definitions, depth + 1)
      );
    }
    if (prop.unevaluatedItems !== undefined) {
      jsonProp.unevaluatedItems = typeof prop.unevaluatedItems === 'boolean'
        ? prop.unevaluatedItems
        : this.convertPropertyToJsonSchema(prop.unevaluatedItems, config, definitions, depth + 1);
    }

    // Object constraints
    if (prop.minProperties !== undefined) jsonProp.minProperties = prop.minProperties;
    if (prop.maxProperties !== undefined) jsonProp.maxProperties = prop.maxProperties;
    if (prop.additionalProperties !== undefined) {
      jsonProp.additionalProperties = typeof prop.additionalProperties === 'boolean'
        ? prop.additionalProperties
        : this.convertPropertyToJsonSchema(prop.additionalProperties, config, definitions, depth + 1);
    }
    
    // Object properties and related
    if (prop.properties) {
      jsonProp.properties = {};
      Object.keys(prop.properties).forEach(key => {
        jsonProp.properties[key] = this.convertPropertyToJsonSchema(prop.properties![key], config, definitions, depth + 1);
      });
    }
    if (prop.patternProperties) {
      jsonProp.patternProperties = {};
      Object.keys(prop.patternProperties).forEach(pattern => {
        jsonProp.patternProperties[pattern] = this.convertPropertyToJsonSchema(prop.patternProperties![pattern], config, definitions, depth + 1);
      });
    }
    if (prop.propertyNames) {
      jsonProp.propertyNames = this.convertPropertyToJsonSchema(prop.propertyNames, config, definitions, depth + 1);
    }
    if (prop.dependencies) jsonProp.dependencies = prop.dependencies;
    if (prop.dependentRequired) jsonProp.dependentRequired = prop.dependentRequired;
    if (prop.dependentSchemas) {
      jsonProp.dependentSchemas = {};
      Object.keys(prop.dependentSchemas).forEach(key => {
        jsonProp.dependentSchemas[key] = this.convertPropertyToJsonSchema(prop.dependentSchemas![key], config, definitions, depth + 1);
      });
    }
    // Draft 2020-12 object features
    if (prop.unevaluatedProperties !== undefined) {
      jsonProp.unevaluatedProperties = typeof prop.unevaluatedProperties === 'boolean'
        ? prop.unevaluatedProperties
        : this.convertPropertyToJsonSchema(prop.unevaluatedProperties, config, definitions, depth + 1);
    }

    // Conditional validation (Draft 7+)
    if (prop.if) {
      jsonProp.if = this.convertPropertyToJsonSchema(prop.if, config, definitions, depth + 1);
    }
    if (prop.then) {
      jsonProp.then = this.convertPropertyToJsonSchema(prop.then, config, definitions, depth + 1);
    }
    if (prop.else) {
      jsonProp.else = this.convertPropertyToJsonSchema(prop.else, config, definitions, depth + 1);
    }

    // Composition keywords
    if (prop.allOf && Array.isArray(prop.allOf)) {
      jsonProp.allOf = prop.allOf.map(item => 
        this.convertPropertyToJsonSchema(item, config, definitions, depth + 1)
      );
    }
    if (prop.anyOf && Array.isArray(prop.anyOf)) {
      jsonProp.anyOf = prop.anyOf.map(item => 
        this.convertPropertyToJsonSchema(item, config, definitions, depth + 1)
      );
    }
    if (prop.oneOf && Array.isArray(prop.oneOf)) {
      jsonProp.oneOf = prop.oneOf.map(item => 
        this.convertPropertyToJsonSchema(item, config, definitions, depth + 1)
      );
    }
    if (prop.not) {
      jsonProp.not = this.convertPropertyToJsonSchema(prop.not, config, definitions, depth + 1);
    }

    // Annotations (Draft 6+)
    if (prop.examples && Array.isArray(prop.examples)) {
      jsonProp.examples = prop.examples;
    }
    if (prop.comment) jsonProp.$comment = prop.comment;
    if (prop.deprecated !== undefined) jsonProp.deprecated = prop.deprecated;
    if (prop.readOnly !== undefined) jsonProp.readOnly = prop.readOnly;
    if (prop.writeOnly !== undefined) jsonProp.writeOnly = prop.writeOnly;

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

  private mergeSchemaProperties(existing: SchemaProperty, additional: SchemaProperty): SchemaProperty {
    const merged: SchemaProperty = { ...existing };
    
    // Merge validation rules
    const mergedRules = [...existing.validationRules];
    additional.validationRules.forEach(rule => {
      if (!mergedRules.find(r => r.type === rule.type)) {
        mergedRules.push(rule);
      }
    });
    merged.validationRules = mergedRules;
    
    // Merge constraints - additional constraints override or supplement existing ones
    if (additional.pattern) merged.pattern = additional.pattern;
    if (additional.format) merged.format = additional.format;
    if (additional.minLength !== undefined) merged.minLength = additional.minLength;
    if (additional.maxLength !== undefined) merged.maxLength = additional.maxLength;
    if (additional.minimum !== undefined) merged.minimum = additional.minimum;
    if (additional.maximum !== undefined) merged.maximum = additional.maximum;
    if (additional.exclusiveMinimum !== undefined) merged.exclusiveMinimum = additional.exclusiveMinimum;
    if (additional.exclusiveMaximum !== undefined) merged.exclusiveMaximum = additional.exclusiveMaximum;
    if (additional.multipleOf !== undefined) merged.multipleOf = additional.multipleOf;
    if (additional.minItems !== undefined) merged.minItems = additional.minItems;
    if (additional.maxItems !== undefined) merged.maxItems = additional.maxItems;
    if (additional.uniqueItems !== undefined) merged.uniqueItems = additional.uniqueItems;
    if (additional.minProperties !== undefined) merged.minProperties = additional.minProperties;
    if (additional.maxProperties !== undefined) merged.maxProperties = additional.maxProperties;
    
    // Merge arrays (enum, examples)
    if (additional.enum) {
      merged.enum = additional.enum;
    }
    if (additional.examples) {
      merged.examples = additional.examples;
    }
    
    // Keep required status from either property (if any requires it)
    merged.required = existing.required || additional.required;
    
    // Use additional title/description if not already set
    if (additional.title && !existing.title) merged.title = additional.title;
    if (additional.description && !existing.description) merged.description = additional.description;
    
    return merged;
  }

  exportAsJson(): string {
    return JSON.stringify(this.schemaSubject.value, null, 2);
  }

  resetSchema(): void {
    this.schemaSubject.next(this.createEmptySchema());
    this.propertiesSubject.next([]);
  }
}