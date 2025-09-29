import { Injectable } from '@angular/core';
import { JsonSchema, SchemaProperty, ValidationRule } from '../models/schema.models';

export interface ValidationError {
  path: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  suggestion?: string;
  property?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  draft: string;
  summary: {
    totalErrors: number;
    totalWarnings: number;
    propertiesValidated: number;
  };
}

export type JsonSchemaDraft = 'draft-04' | 'draft-07' | 'draft-2019-09' | 'draft-2020-12';

@Injectable({
  providedIn: 'root'
})
export class SchemaValidationService {
  private supportedDrafts: JsonSchemaDraft[] = [
    'draft-04',
    'draft-07', 
    'draft-2019-09',
    'draft-2020-12'
  ];

  private draftSchemas = {
    'draft-04': 'http://json-schema.org/draft-04/schema#',
    'draft-07': 'http://json-schema.org/draft-07/schema#',
    'draft-2019-09': 'https://json-schema.org/draft/2019-09/schema',
    'draft-2020-12': 'https://json-schema.org/draft/2020-12/schema'
  };

  constructor() {}

  /**
   * Comprehensive validation of a JSON Schema
   */
  validateSchema(schema: JsonSchema, targetDraft: JsonSchemaDraft = 'draft-07'): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];
    let propertiesValidated = 0;

    try {
      // Basic structure validation
      this.validateBasicStructure(schema, errors);
      
      // Draft-specific validation
      this.validateDraftCompliance(schema, targetDraft, errors, warnings);
      
      // $ref validation
      this.validateReferences(schema, errors);
      
      // Properties validation
      if (schema.properties) {
        propertiesValidated = this.validateProperties(schema.properties, schema, errors, warnings, targetDraft);
      }
      
      // Definitions validation
      if (schema.definitions) {
        this.validateDefinitions(schema.definitions, errors, warnings, targetDraft);
      }
      
      // Constraint validation
      this.validateConstraints(schema, errors, warnings);

    } catch (error) {
      errors.push({
        path: '$',
        message: `Validation failed: ${error}`,
        severity: 'error'
      });
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      draft: targetDraft,
      summary: {
        totalErrors: errors.length,
        totalWarnings: warnings.length,
        propertiesValidated
      }
    };
  }

  /**
   * Get supported draft versions
   */
  getSupportedDrafts(): JsonSchemaDraft[] {
    return [...this.supportedDrafts];
  }

  /**
   * Get draft schema URI
   */
  getDraftSchemaUri(draft: JsonSchemaDraft): string {
    return this.draftSchemas[draft];
  }

  private validateBasicStructure(schema: JsonSchema, errors: ValidationError[]): void {
    // Check for required top-level properties
    if (!schema.type && !schema.properties && !schema.$ref) {
      errors.push({
        path: '$',
        message: 'Schema must have at least one of: type, properties, or $ref',
        severity: 'error',
        suggestion: 'Add a "type" property or define "properties"'
      });
    }

    // Validate schema URI if present
    if (schema.$schema && !this.isValidSchemaUri(schema.$schema)) {
      errors.push({
        path: '$schema',
        message: 'Invalid or unsupported $schema URI',
        severity: 'error',
        suggestion: 'Use a supported JSON Schema draft URI'
      });
    }

    // Check for empty title
    if (schema.title && schema.title.trim() === '') {
      errors.push({
        path: '$.title',
        message: 'Schema title should not be empty',
        severity: 'warning',
        suggestion: 'Provide a meaningful title or remove the title property'
      });
    }
  }

  private validateDraftCompliance(
    schema: JsonSchema, 
    draft: JsonSchemaDraft, 
    errors: ValidationError[], 
    warnings: ValidationError[]
  ): void {
    // Draft-specific keyword validation
    switch (draft) {
      case 'draft-04':
        this.validateDraft04Compliance(schema, errors, warnings);
        break;
      case 'draft-07':
        this.validateDraft07Compliance(schema, errors, warnings);
        break;
      case 'draft-2019-09':
        this.validateDraft201909Compliance(schema, errors, warnings);
        break;
      case 'draft-2020-12':
        this.validateDraft202012Compliance(schema, errors, warnings);
        break;
    }
  }

  private validateDraft04Compliance(schema: any, errors: ValidationError[], warnings: ValidationError[]): void {
    // Draft 4 doesn't support certain keywords
    if (schema.const !== undefined) {
      warnings.push({
        path: '$.const',
        message: '"const" keyword is not supported in JSON Schema Draft 4',
        severity: 'warning',
        suggestion: 'Use "enum" with a single value instead, or upgrade to Draft 7+'
      });
    }

    if (schema.if || schema.then || schema.else) {
      warnings.push({
        path: '$',
        message: 'Conditional keywords (if/then/else) are not supported in Draft 4',
        severity: 'warning',
        suggestion: 'Upgrade to Draft 7+ or use alternative validation approaches'
      });
    }
  }

  private validateDraft07Compliance(schema: any, errors: ValidationError[], warnings: ValidationError[]): void {
    // Draft 7 specific validations
    if (schema.unevaluatedProperties !== undefined) {
      warnings.push({
        path: '$.unevaluatedProperties',
        message: '"unevaluatedProperties" is not available in Draft 7',
        severity: 'warning',
        suggestion: 'This keyword was introduced in Draft 2019-09'
      });
    }
  }

  private validateDraft201909Compliance(schema: any, errors: ValidationError[], warnings: ValidationError[]): void {
    // Draft 2019-09 specific validations
    if (schema.dependencies && typeof schema.dependencies === 'object') {
      warnings.push({
        path: '$.dependencies',
        message: '"dependencies" keyword structure changed in Draft 2019-09',
        severity: 'warning',
        suggestion: 'Consider using "dependentRequired" and "dependentSchemas"'
      });
    }
  }

  private validateDraft202012Compliance(schema: any, errors: ValidationError[], warnings: ValidationError[]): void {
    // Draft 2020-12 specific validations  
    if (schema.$recursiveRef !== undefined) {
      warnings.push({
        path: '$.$recursiveRef',
        message: '"$recursiveRef" was replaced with "$dynamicRef" in Draft 2020-12',
        severity: 'warning',
        suggestion: 'Use "$dynamicRef" instead'
      });
    }
  }

  private validateReferences(schema: JsonSchema, errors: ValidationError[]): void {
    const refs = this.extractReferences(schema);
    const definitions = schema.definitions || {};

    refs.forEach(ref => {
      if (ref.startsWith('#/definitions/')) {
        const defName = ref.replace('#/definitions/', '');
        if (!definitions[defName]) {
          errors.push({
            path: ref,
            message: `Reference "${ref}" points to undefined definition`,
            severity: 'error',
            suggestion: `Add definition "${defName}" or fix the reference`
          });
        }
      } else if (ref.startsWith('#/')) {
        // JSON Pointer validation (basic)
        if (!this.isValidJsonPointer(ref)) {
          errors.push({
            path: ref,
            message: `Invalid JSON Pointer reference: ${ref}`,
            severity: 'error',
            suggestion: 'Use valid JSON Pointer syntax (e.g., #/properties/fieldName)'
          });
        }
      }
    });
  }

  private validateProperties(
    properties: { [key: string]: any }, 
    schema: JsonSchema, 
    errors: ValidationError[], 
    warnings: ValidationError[],
    draft: JsonSchemaDraft,
    basePath: string = '$.properties'
  ): number {
    let count = 0;
    
    Object.keys(properties).forEach(propName => {
      const property = properties[propName];
      const propertyPath = `${basePath}.${propName}`;
      count++;

      // Validate property structure
      this.validatePropertyStructure(property, propertyPath, errors, warnings, draft);

      // Validate nested properties
      if (property.properties) {
        count += this.validateProperties(property.properties, schema, errors, warnings, draft, `${propertyPath}.properties`);
      }

      // Validate array items
      if (property.type === 'array' && property.items) {
        if (property.items.properties) {
          count += this.validateProperties(property.items.properties, schema, errors, warnings, draft, `${propertyPath}.items.properties`);
        }
      }
    });

    return count;
  }

  private validatePropertyStructure(
    property: any, 
    path: string, 
    errors: ValidationError[], 
    warnings: ValidationError[],
    draft: JsonSchemaDraft
  ): void {
    // Type validation
    if (property.type && !this.isValidType(property.type)) {
      errors.push({
        path,
        message: `Invalid type: ${property.type}`,
        severity: 'error',
        suggestion: 'Use valid JSON Schema types: string, number, integer, boolean, object, array, null'
      });
    }

    // String constraints
    if (property.type === 'string') {
      this.validateStringConstraints(property, path, errors, warnings);
    }

    // Number constraints  
    if (property.type === 'number' || property.type === 'integer') {
      this.validateNumericConstraints(property, path, errors, warnings);
    }

    // Array constraints
    if (property.type === 'array') {
      this.validateArrayConstraints(property, path, errors, warnings);
    }

    // Object constraints
    if (property.type === 'object') {
      this.validateObjectConstraints(property, path, errors, warnings);
    }

    // Format validation
    if (property.format) {
      this.validateFormat(property.format, property.type, path, warnings);
    }
  }

  private validateStringConstraints(property: any, path: string, errors: ValidationError[], warnings: ValidationError[]): void {
    if (property.minLength !== undefined && property.maxLength !== undefined) {
      if (property.minLength > property.maxLength) {
        errors.push({
          path,
          message: 'minLength cannot be greater than maxLength',
          severity: 'error',
          suggestion: 'Ensure minLength ≤ maxLength'
        });
      }
    }

    if (property.pattern) {
      try {
        new RegExp(property.pattern);
      } catch (e) {
        errors.push({
          path: `${path}.pattern`,
          message: 'Invalid regular expression pattern',
          severity: 'error',
          suggestion: 'Use valid JavaScript RegExp syntax'
        });
      }
    }
  }

  private validateNumericConstraints(property: any, path: string, errors: ValidationError[], warnings: ValidationError[]): void {
    if (property.minimum !== undefined && property.maximum !== undefined) {
      if (property.minimum > property.maximum) {
        errors.push({
          path,
          message: 'minimum cannot be greater than maximum',
          severity: 'error',
          suggestion: 'Ensure minimum ≤ maximum'
        });
      }
    }

    if (property.multipleOf !== undefined && property.multipleOf <= 0) {
      errors.push({
        path: `${path}.multipleOf`,
        message: 'multipleOf must be greater than 0',
        severity: 'error',
        suggestion: 'Use a positive number for multipleOf'
      });
    }
  }

  private validateArrayConstraints(property: any, path: string, errors: ValidationError[], warnings: ValidationError[]): void {
    if (property.minItems !== undefined && property.maxItems !== undefined) {
      if (property.minItems > property.maxItems) {
        errors.push({
          path,
          message: 'minItems cannot be greater than maxItems',
          severity: 'error',
          suggestion: 'Ensure minItems ≤ maxItems'
        });
      }
    }

    if (!property.items) {
      warnings.push({
        path,
        message: 'Array type should define items schema',
        severity: 'warning',
        suggestion: 'Add "items" property to specify array element schema'
      });
    }
  }

  private validateObjectConstraints(property: any, path: string, errors: ValidationError[], warnings: ValidationError[]): void {
    if (property.minProperties !== undefined && property.maxProperties !== undefined) {
      if (property.minProperties > property.maxProperties) {
        errors.push({
          path,
          message: 'minProperties cannot be greater than maxProperties',
          severity: 'error',
          suggestion: 'Ensure minProperties ≤ maxProperties'
        });
      }
    }
  }

  private validateDefinitions(definitions: { [key: string]: any }, errors: ValidationError[], warnings: ValidationError[], draft: JsonSchemaDraft): void {
    Object.keys(definitions).forEach(defName => {
      const definition = definitions[defName];
      const defPath = `$.definitions.${defName}`;

      // Validate each definition as a schema
      this.validatePropertyStructure(definition, defPath, errors, warnings, draft);

      if (definition.properties) {
        this.validateProperties(definition.properties, { definitions } as JsonSchema, errors, warnings, draft, `${defPath}.properties`);
      }
    });
  }

  private validateConstraints(schema: JsonSchema, errors: ValidationError[], warnings: ValidationError[]): void {
    // Check for logical inconsistencies
    if (schema.required && Array.isArray(schema.required)) {
      const properties = schema.properties || {};
      schema.required.forEach(requiredProp => {
        if (!properties[requiredProp]) {
          errors.push({
            path: '$.required',
            message: `Required property "${requiredProp}" is not defined in properties`,
            severity: 'error',
            property: requiredProp,
            suggestion: `Add "${requiredProp}" to properties or remove from required array`
          });
        }
      });
    }
  }

  // Utility methods
  private isValidSchemaUri(uri: string): boolean {
    return Object.values(this.draftSchemas).includes(uri);
  }

  private isValidType(type: string): boolean {
    const validTypes = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'];
    return validTypes.includes(type);
  }

  private isValidJsonPointer(pointer: string): boolean {
    // Basic JSON Pointer validation
    return pointer.startsWith('#/') && !pointer.includes('//');
  }

  private validateFormat(format: string, type: string, path: string, warnings: ValidationError[]): void {
    const commonFormats = ['date', 'time', 'date-time', 'email', 'hostname', 'ipv4', 'ipv6', 'uri', 'uuid'];
    
    if (!commonFormats.includes(format)) {
      warnings.push({
        path: `${path}.format`,
        message: `Format "${format}" may not be widely supported`,
        severity: 'warning',
        suggestion: 'Use standard formats when possible'
      });
    }

    if (type !== 'string' && format) {
      warnings.push({
        path: `${path}.format`,
        message: 'Format is typically used with string type',
        severity: 'warning',
        suggestion: 'Consider if format is appropriate for this type'
      });
    }
  }

  private extractReferences(obj: any, refs: string[] = []): string[] {
    if (typeof obj !== 'object' || obj === null) {
      return refs;
    }

    if (obj.$ref && typeof obj.$ref === 'string') {
      refs.push(obj.$ref);
    }

    Object.values(obj).forEach(value => {
      this.extractReferences(value, refs);
    });

    return refs;
  }
}