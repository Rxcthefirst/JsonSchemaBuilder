import { Injectable } from '@angular/core';
import { JsonSchema, SchemaProperty, PropertyType } from '../models/schema.models';

export interface SampleGenerationOptions {
  includeOptionalProperties?: boolean;
  useExampleValues?: boolean;
  useDefaultValues?: boolean;
  arrayMinItems?: number;
  arrayMaxItems?: number;
  stringMinLength?: number;
  stringMaxLength?: number;
  objectMaxProperties?: number;
  includeNullValues?: boolean;
  preferRealisticData?: boolean;
  locale?: 'en' | 'es' | 'fr' | 'de';
}

export interface SampleDataGenerationResult {
  sample: any;
  metadata: {
    propertiesGenerated: number;
    optionalPropertiesIncluded: number;
    examplesUsed: number;
    defaultsUsed: number;
    warnings: string[];
  };
}

@Injectable({
  providedIn: 'root'
})
export class SampleDataGeneratorService {

  private realisticData = {
    names: {
      first: ['Alice', 'Bob', 'Carol', 'David', 'Emma', 'Frank', 'Grace', 'Henry', 'Iris', 'Jack'],
      last: ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez']
    },
    emails: ['@gmail.com', '@yahoo.com', '@outlook.com', '@company.com', '@example.com'],
    domains: ['example.com', 'test.org', 'sample.net', 'demo.io', 'placeholder.co'],
    cities: ['New York', 'London', 'Tokyo', 'Paris', 'Berlin', 'Sydney', 'Toronto', 'Amsterdam', 'Barcelona', 'Stockholm'],
    companies: ['TechCorp', 'DataSoft', 'CloudInc', 'DevTools', 'WebSolutions', 'CodeWorks', 'DataFlow', 'AppTech', 'SysNet', 'InfoTech'],
    products: ['Widget', 'Gadget', 'Tool', 'Device', 'Component', 'Module', 'Element', 'Item', 'Product', 'Service']
  };

  generateSampleData(
    schema: JsonSchema, 
    options: SampleGenerationOptions = {}
  ): SampleDataGenerationResult {
    const defaultOptions: SampleGenerationOptions = {
      includeOptionalProperties: true,
      useExampleValues: true,
      useDefaultValues: true,
      arrayMinItems: 1,
      arrayMaxItems: 3,
      stringMinLength: 3,
      stringMaxLength: 20,
      objectMaxProperties: 10,
      includeNullValues: false,
      preferRealisticData: true,
      locale: 'en',
      ...options
    };

    const metadata = {
      propertiesGenerated: 0,
      optionalPropertiesIncluded: 0,
      examplesUsed: 0,
      defaultsUsed: 0,
      warnings: [] as string[]
    };

    let sample: any;

    try {
      if (schema.$ref) {
        // Handle $ref at root level
        sample = this.handleReference(schema.$ref, schema, defaultOptions, metadata);
      } else if (schema.type) {
        sample = this.generateValueForProperty(schema as any, defaultOptions, metadata, new Set());
      } else if (schema.properties) {
        // Treat as object if properties exist but no type
        sample = this.generateObjectValue(schema as any, defaultOptions, metadata, new Set());
      } else {
        sample = this.generateGenericValue(defaultOptions);
        metadata.warnings.push('Schema has no clear type definition, generated generic value');
      }
    } catch (error) {
      metadata.warnings.push(`Generation error: ${error}`);
      sample = { error: 'Failed to generate sample data' };
    }

    return { sample, metadata };
  }

  generateMultipleSamples(
    schema: JsonSchema,
    count: number = 3,
    options: SampleGenerationOptions = {}
  ): SampleDataGenerationResult[] {
    const samples: SampleDataGenerationResult[] = [];
    
    for (let i = 0; i < count; i++) {
      // Add slight variation to options for each sample
      const variedOptions = {
        ...options,
        arrayMinItems: Math.max(0, (options.arrayMinItems || 1) + Math.floor(Math.random() * 2) - 1),
        arrayMaxItems: (options.arrayMaxItems || 3) + Math.floor(Math.random() * 2)
      };
      
      samples.push(this.generateSampleData(schema, variedOptions));
    }
    
    return samples;
  }

  private generateValueForProperty(
    property: SchemaProperty,
    options: SampleGenerationOptions,
    metadata: any,
    refStack: Set<string>
  ): any {
    metadata.propertiesGenerated++;

    // Handle $ref
    if (property.$ref) {
      return this.handleReference(property.$ref, property, options, metadata);
    }

    // Use examples if available and option is enabled
    if (options.useExampleValues && property.examples && property.examples.length > 0) {
      metadata.examplesUsed++;
      return this.randomChoice(property.examples);
    }

    // Use default if available and option is enabled
    if (options.useDefaultValues && property.defaultValue !== undefined) {
      metadata.defaultsUsed++;
      return property.defaultValue;
    }

    // Use const value if defined
    if (property.const !== undefined) {
      return property.const;
    }

    // Use enum if available
    if (property.enum && property.enum.length > 0) {
      return this.randomChoice(property.enum);
    }

    // Generate based on type
    switch (property.type) {
      case PropertyType.STRING:
        return this.generateStringValue(property, options);
      case PropertyType.NUMBER:
        return this.generateNumberValue(property, false);
      case PropertyType.INTEGER:
        return this.generateNumberValue(property, true);
      case PropertyType.BOOLEAN:
        return Math.random() > 0.5;
      case PropertyType.ARRAY:
        return this.generateArrayValue(property, options, metadata, refStack);
      case PropertyType.OBJECT:
        return this.generateObjectValue(property, options, metadata, refStack);
      case PropertyType.NULL:
        return null;
      default:
        return this.generateGenericValue(options);
    }
  }

  private generateStringValue(property: SchemaProperty, options: SampleGenerationOptions): string {
    // Handle format-specific generation
    if (property.format) {
      switch (property.format) {
        case 'email':
          return this.generateEmail(options);
        case 'uri':
        case 'uri-reference':
          return this.generateUri();
        case 'date-time':
          return new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString();
        case 'date':
          return new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        case 'time':
          return new Date(Date.now()).toISOString().split('T')[1];
        case 'uuid':
          return this.generateUUID();
        case 'ipv4':
          return `${this.randomInt(1, 255)}.${this.randomInt(0, 255)}.${this.randomInt(0, 255)}.${this.randomInt(1, 255)}`;
        case 'ipv6':
          return Array(8).fill(0).map(() => Math.floor(Math.random() * 65536).toString(16).padStart(4, '0')).join(':');
        case 'hostname':
          return this.randomChoice(this.realisticData.domains);
        default:
          break;
      }
    }

    // Handle pattern if available
    if (property.pattern) {
      try {
        return this.generateFromPattern(property.pattern);
      } catch (error) {
        // Fall back to regular string generation if pattern is too complex
      }
    }

    // Generate string with length constraints
    const minLength = property.minLength || options.stringMinLength || 3;
    const maxLength = property.maxLength || options.stringMaxLength || 20;
    const targetLength = this.randomInt(minLength, maxLength);

    // Generate realistic string based on property name context
    if (options.preferRealisticData && property.name) {
      const name = property.name.toLowerCase();
      
      if (name.includes('name') || name.includes('title')) {
        if (name.includes('first') || name === 'name') {
          return this.randomChoice(this.realisticData.names.first);
        }
        if (name.includes('last') || name.includes('surname')) {
          return this.randomChoice(this.realisticData.names.last);
        }
        if (name.includes('company') || name.includes('organization')) {
          return this.randomChoice(this.realisticData.companies);
        }
        return `${this.randomChoice(this.realisticData.names.first)} ${this.randomChoice(this.realisticData.names.last)}`;
      }
      
      if (name.includes('email') || name.includes('mail')) {
        return this.generateEmail(options);
      }
      
      if (name.includes('city') || name.includes('location')) {
        return this.randomChoice(this.realisticData.cities);
      }
      
      if (name.includes('product') || name.includes('item')) {
        return this.randomChoice(this.realisticData.products);
      }
      
      if (name.includes('description') || name.includes('comment')) {
        return `Sample ${this.randomChoice(this.realisticData.products).toLowerCase()} description for testing purposes.`;
      }
    }

    // Generate generic string
    return this.generateRandomString(targetLength);
  }

  private generateNumberValue(property: SchemaProperty, isInteger: boolean): number {
    let min = property.minimum || 0;
    let max = property.maximum || 1000;

    // Handle exclusive bounds
    if (property.exclusiveMinimum !== undefined) {
      if (typeof property.exclusiveMinimum === 'number') {
        min = property.exclusiveMinimum + (isInteger ? 1 : 0.01);
      } else if (property.exclusiveMinimum === true && property.minimum !== undefined) {
        min = property.minimum + (isInteger ? 1 : 0.01);
      }
    }

    if (property.exclusiveMaximum !== undefined) {
      if (typeof property.exclusiveMaximum === 'number') {
        max = property.exclusiveMaximum - (isInteger ? 1 : 0.01);
      } else if (property.exclusiveMaximum === true && property.maximum !== undefined) {
        max = property.maximum - (isInteger ? 1 : 0.01);
      }
    }

    let value = min + Math.random() * (max - min);

    if (isInteger) {
      value = Math.floor(value);
    } else {
      value = Math.round(value * 100) / 100; // Round to 2 decimal places
    }

    // Handle multipleOf constraint
    if (property.multipleOf && property.multipleOf > 0) {
      value = Math.round(value / property.multipleOf) * property.multipleOf;
      if (isInteger && value !== Math.floor(value)) {
        value = Math.floor(value / property.multipleOf) * property.multipleOf;
      }
    }

    return value;
  }

  private generateArrayValue(
    property: SchemaProperty,
    options: SampleGenerationOptions,
    metadata: any,
    refStack: Set<string>
  ): any[] {
    const minItems = property.minItems || options.arrayMinItems || 1;
    const maxItems = property.maxItems || options.arrayMaxItems || 3;
    const itemCount = this.randomInt(minItems, maxItems);

    const items: any[] = [];
    const uniqueSet = new Set();

    for (let i = 0; i < itemCount; i++) {
      let itemValue: any;

      if (property.items) {
        itemValue = this.generateValueForProperty(property.items, options, metadata, refStack);
      } else {
        // Generate mixed types if no items schema
        itemValue = this.generateGenericValue(options);
      }

      // Handle uniqueItems constraint
      if (property.uniqueItems) {
        const itemKey = JSON.stringify(itemValue);
        if (uniqueSet.has(itemKey)) {
          continue; // Skip duplicate
        }
        uniqueSet.add(itemKey);
      }

      items.push(itemValue);
    }

    return items;
  }

  private generateObjectValue(
    property: SchemaProperty,
    options: SampleGenerationOptions,
    metadata: any,
    refStack: Set<string>
  ): any {
    const obj: any = {};

    if (property.properties) {
      const propertyNames = Object.keys(property.properties);
      let processedCount = 0;

      for (const propName of propertyNames) {
        // Respect maxProperties limit
        if (options.objectMaxProperties && processedCount >= options.objectMaxProperties) {
          break;
        }

        const propSchema = property.properties[propName];
        const isRequired = (Array.isArray(property.required) && property.required.includes(propName)) || false;

        // Include property if required or if including optional properties
        if (isRequired || (options.includeOptionalProperties && Math.random() > 0.3)) {
          if (!isRequired && options.includeOptionalProperties) {
            metadata.optionalPropertiesIncluded++;
          }

          const propWithName = { ...propSchema, name: propName };
          obj[propName] = this.generateValueForProperty(propWithName, options, metadata, refStack);
          processedCount++;
        }
      }
    }

    return obj;
  }

  private handleReference(ref: string, rootSchema: any, options: SampleGenerationOptions, metadata: any): any {
    // Simple $ref handling for #/definitions/...
    if (ref.startsWith('#/definitions/')) {
      const defName = ref.replace('#/definitions/', '');
      if (rootSchema.definitions && rootSchema.definitions[defName]) {
        return this.generateValueForProperty(rootSchema.definitions[defName], options, metadata, new Set());
      }
    }
    
    metadata.warnings.push(`Unresolved reference: ${ref}`);
    return { $ref: ref };
  }

  // Utility methods
  private generateEmail(options: SampleGenerationOptions): string {
    const firstName = this.randomChoice(this.realisticData.names.first).toLowerCase();
    const lastName = this.randomChoice(this.realisticData.names.last).toLowerCase();
    const domain = this.randomChoice(this.realisticData.emails);
    return `${firstName}.${lastName}${domain}`;
  }

  private generateUri(): string {
    const protocol = this.randomChoice(['https', 'http']);
    const domain = this.randomChoice(this.realisticData.domains);
    const path = this.randomChoice(['', '/api/v1', '/docs', '/users', '/products', '/data']);
    return `${protocol}://${domain}${path}`;
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c == 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private generateFromPattern(pattern: string): string {
    // Simple pattern generation for common cases
    // This is a basic implementation - a full regex generator would be more complex
    
    // Handle some common patterns
    if (pattern === '^[a-zA-Z0-9]+$') {
      return this.generateRandomString(8, 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789');
    }
    if (pattern === '^[A-Z]{2,3}$') {
      const length = Math.random() > 0.5 ? 2 : 3;
      return this.generateRandomString(length, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    }
    if (pattern.includes('[0-9]') || pattern.includes('\\\\d')) {
      return this.generateRandomString(6, '0123456789');
    }
    
    // Fallback to simple string
    return this.generateRandomString(8);
  }

  private generateRandomString(length: number, charset?: string): string {
    const chars = charset || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
    let result = '';
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result.trim() || 'sample';
  }

  private generateGenericValue(options: SampleGenerationOptions): any {
    const types = ['string', 'number', 'boolean'];
    const type = this.randomChoice(types);
    
    switch (type) {
      case 'string':
        return this.generateRandomString(8);
      case 'number':
        return Math.floor(Math.random() * 100);
      case 'boolean':
        return Math.random() > 0.5;
      default:
        return 'sample';
    }
  }

  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)];
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}