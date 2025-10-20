import { Injectable } from '@angular/core';
import { Observable, of, forkJoin } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import * as _ from 'lodash';
import {
  EvolutionAnalysis,
  SchemaChange,
  SchemaChangeType,
  MigrationStep,
  RiskAssessment,
  CompatibilityLevel
} from '../../models/schema-registry.models.js';
import { JsonSchema, PropertyType } from '../../models/schema.models.js';

@Injectable({
  providedIn: 'root'
})
export class JsonSchemaCompatibilityService {

  constructor() {}

  /**
   * Analyze evolution between two JSON Schema versions
   */
  analyzeEvolution(oldSchema: JsonSchema, newSchema: JsonSchema): EvolutionAnalysis {
    const changes = this.detectChanges(oldSchema, newSchema);
    const migrationPath = this.generateMigrationPath(changes);
    const riskAssessment = this.assessRisk(changes);

    return {
      isBackwardCompatible: this.isBackwardCompatible(changes),
      isForwardCompatible: this.isForwardCompatible(changes),
      changes,
      migrationPath,
      riskAssessment
    };
  }

  /**
   * Check if changes are backward compatible
   */
  private isBackwardCompatible(changes: SchemaChange[]): boolean {
    return !changes.some(change => 
      change.breaking && (change.direction === 'backward' || change.direction === 'both')
    );
  }

  /**
   * Check if changes are forward compatible
   */
  private isForwardCompatible(changes: SchemaChange[]): boolean {
    return !changes.some(change => 
      change.breaking && (change.direction === 'forward' || change.direction === 'both')
    );
  }

  /**
   * Detect all changes between schemas
   */
  private detectChanges(oldSchema: JsonSchema, newSchema: JsonSchema): SchemaChange[] {
    const changes: SchemaChange[] = [];

    // Check schema-level changes
    changes.push(...this.checkSchemaMetadataChanges(oldSchema, newSchema));
    changes.push(...this.checkRequiredFieldChanges(oldSchema, newSchema));
    changes.push(...this.checkPropertyChanges(oldSchema, newSchema));
    changes.push(...this.checkTypeChanges(oldSchema, newSchema));
    changes.push(...this.checkConstraintChanges(oldSchema, newSchema));
    changes.push(...this.checkCompositionChanges(oldSchema, newSchema));

    return changes;
  }

  /**
   * Check for changes in schema metadata
   */
  private checkSchemaMetadataChanges(oldSchema: JsonSchema, newSchema: JsonSchema): SchemaChange[] {
    const changes: SchemaChange[] = [];

    // Title changes are non-breaking
    if (oldSchema.title !== newSchema.title) {
      changes.push({
        type: 'SCHEMA_METADATA_CHANGED',
        field: 'title',
        breaking: false,
        direction: 'both',
        description: `Schema title changed from "${oldSchema.title}" to "${newSchema.title}"`,
        impact: 'LOW',
        oldValue: oldSchema.title,
        newValue: newSchema.title,
        path: '$.title'
      });
    }

    // Description changes are non-breaking
    if (oldSchema.description !== newSchema.description) {
      changes.push({
        type: 'SCHEMA_METADATA_CHANGED',
        field: 'description',
        breaking: false,
        direction: 'both',
        description: 'Schema description changed',
        impact: 'LOW',
        oldValue: oldSchema.description,
        newValue: newSchema.description,
        path: '$.description'
      });
    }

    return changes;
  }

  /**
   * Check for required field changes
   */
  private checkRequiredFieldChanges(oldSchema: JsonSchema, newSchema: JsonSchema): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const oldRequired = new Set(oldSchema.required || []);
    const newRequired = new Set(newSchema.required || []);

    // Removed required fields (breaking for backward compatibility)
    oldRequired.forEach(field => {
      if (!newRequired.has(field)) {
        changes.push({
          type: 'REQUIRED_FIELD_REMOVED',
          field,
          breaking: true,
          direction: 'backward',
          description: `Required field '${field}' was removed`,
          impact: 'HIGH',
          path: `$.properties.${field}`
        });
      }
    });

    // Added required fields (breaking for forward compatibility)
    newRequired.forEach(field => {
      if (!oldRequired.has(field)) {
        changes.push({
          type: 'REQUIRED_FIELD_ADDED',
          field,
          breaking: true,
          direction: 'forward',
          description: `Required field '${field}' was added`,
          impact: 'HIGH',
          path: `$.properties.${field}`
        });
      }
    });

    return changes;
  }

  /**
   * Check for property-level changes
   */
  private checkPropertyChanges(oldSchema: JsonSchema, newSchema: JsonSchema): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const oldProperties = oldSchema.properties || {};
    const newProperties = newSchema.properties || {};
    const oldPropertyNames = new Set(Object.keys(oldProperties));
    const newPropertyNames = new Set(Object.keys(newProperties));

    // Removed properties (breaking for backward compatibility)
    oldPropertyNames.forEach(propertyName => {
      if (!newPropertyNames.has(propertyName)) {
        changes.push({
          type: 'FIELD_REMOVED',
          field: propertyName,
          breaking: true,
          direction: 'backward',
          description: `Property '${propertyName}' was removed`,
          impact: 'HIGH',
          path: `$.properties.${propertyName}`
        });
      }
    });

    // Added properties (generally safe)
    newPropertyNames.forEach(propertyName => {
      if (!oldPropertyNames.has(propertyName)) {
        const isRequired = (newSchema.required || []).includes(propertyName);
        changes.push({
          type: 'FIELD_ADDED',
          field: propertyName,
          breaking: isRequired,
          direction: isRequired ? 'forward' : 'both',
          description: `Property '${propertyName}' was added${isRequired ? ' as required' : ''}`,
          impact: isRequired ? 'MEDIUM' : 'LOW',
          path: `$.properties.${propertyName}`
        });
      }
    });

    // Check changes in existing properties
    oldPropertyNames.forEach(propertyName => {
      if (newPropertyNames.has(propertyName)) {
        const oldProp = oldProperties[propertyName];
        const newProp = newProperties[propertyName];
        changes.push(...this.compareProperties(propertyName, oldProp, newProp));
      }
    });

    return changes;
  }

  /**
   * Compare two properties for changes
   */
  private compareProperties(propertyName: string, oldProp: any, newProp: any): SchemaChange[] {
    const changes: SchemaChange[] = [];
    const path = `$.properties.${propertyName}`;

    // Type changes
    if (oldProp.type !== newProp.type) {
      const isBreaking = !this.areTypesCompatible(oldProp.type, newProp.type);
      changes.push({
        type: 'FIELD_TYPE_CHANGED',
        field: propertyName,
        breaking: isBreaking,
        direction: 'both',
        description: `Property '${propertyName}' type changed from ${oldProp.type} to ${newProp.type}`,
        impact: isBreaking ? 'HIGH' : 'MEDIUM',
        oldValue: oldProp.type,
        newValue: newProp.type,
        path: `${path}.type`
      });
    }

    // Enum changes
    if (oldProp.enum || newProp.enum) {
      changes.push(...this.checkEnumChanges(propertyName, oldProp.enum, newProp.enum, path));
    }

    // Constraint changes
    changes.push(...this.checkPropertyConstraints(propertyName, oldProp, newProp, path));

    return changes;
  }

  /**
   * Check if types are compatible
   */
  private areTypesCompatible(oldType: PropertyType, newType: PropertyType): boolean {
    // Same type is always compatible
    if (oldType === newType) return true;

    // Number to integer is generally safe (data loss possible but structurally compatible)
    if (oldType === PropertyType.INTEGER && newType === PropertyType.NUMBER) return true;

    // Most other type changes are breaking
    return false;
  }

  /**
   * Check enum value changes
   */
  private checkEnumChanges(propertyName: string, oldEnum: any[], newEnum: any[], path: string): SchemaChange[] {
    const changes: SchemaChange[] = [];

    if (!oldEnum && newEnum) {
      // Added enum constraint (breaking - more restrictive)
      changes.push({
        type: 'CONSTRAINT_ADDED',
        field: propertyName,
        breaking: true,
        direction: 'both',
        description: `Enum constraint added to property '${propertyName}'`,
        impact: 'HIGH',
        newValue: newEnum,
        path: `${path}.enum`
      });
    } else if (oldEnum && !newEnum) {
      // Removed enum constraint (safe - less restrictive)
      changes.push({
        type: 'CONSTRAINT_REMOVED',
        field: propertyName,
        breaking: false,
        direction: 'both',
        description: `Enum constraint removed from property '${propertyName}'`,
        impact: 'LOW',
        oldValue: oldEnum,
        path: `${path}.enum`
      });
    } else if (oldEnum && newEnum) {
      const oldSet = new Set(oldEnum);
      const newSet = new Set(newEnum);

      // Check for removed enum values
      oldEnum.forEach(value => {
        if (!newSet.has(value)) {
          changes.push({
            type: 'ENUM_VALUE_REMOVED',
            field: propertyName,
            breaking: true,
            direction: 'both',
            description: `Enum value '${value}' removed from property '${propertyName}'`,
            impact: 'HIGH',
            oldValue: value,
            path: `${path}.enum`
          });
        }
      });

      // Check for added enum values
      newEnum.forEach(value => {
        if (!oldSet.has(value)) {
          changes.push({
            type: 'ENUM_VALUE_ADDED',
            field: propertyName,
            breaking: false,
            direction: 'both',
            description: `Enum value '${value}' added to property '${propertyName}'`,
            impact: 'LOW',
            newValue: value,
            path: `${path}.enum`
          });
        }
      });
    }

    return changes;
  }

  /**
   * Check constraint changes (min/max, length, etc.)
   */
  private checkPropertyConstraints(propertyName: string, oldProp: any, newProp: any, path: string): SchemaChange[] {
    const changes: SchemaChange[] = [];
    
    // String constraints
    changes.push(...this.checkConstraintChange(propertyName, 'minLength', oldProp.minLength, newProp.minLength, path, true));
    changes.push(...this.checkConstraintChange(propertyName, 'maxLength', oldProp.maxLength, newProp.maxLength, path, false));
    
    // Number constraints
    changes.push(...this.checkConstraintChange(propertyName, 'minimum', oldProp.minimum, newProp.minimum, path, false));
    changes.push(...this.checkConstraintChange(propertyName, 'maximum', oldProp.maximum, newProp.maximum, path, true));
    
    // Array constraints
    changes.push(...this.checkConstraintChange(propertyName, 'minItems', oldProp.minItems, newProp.minItems, path, true));
    changes.push(...this.checkConstraintChange(propertyName, 'maxItems', oldProp.maxItems, newProp.maxItems, path, false));

    return changes;
  }

  /**
   * Check individual constraint change
   */
  private checkConstraintChange(
    propertyName: string, 
    constraintName: string, 
    oldValue: any, 
    newValue: any, 
    path: string,
    isMinConstraint: boolean
  ): SchemaChange[] {
    const changes: SchemaChange[] = [];

    if (oldValue !== newValue) {
      let breaking = false;
      let description = '';
      let impact: 'LOW' | 'MEDIUM' | 'HIGH' = 'MEDIUM';

      if (oldValue == null && newValue != null) {
        // Added constraint
        breaking = true;
        description = `${constraintName} constraint added to property '${propertyName}': ${newValue}`;
        impact = 'HIGH';
      } else if (oldValue != null && newValue == null) {
        // Removed constraint
        breaking = false;
        description = `${constraintName} constraint removed from property '${propertyName}'`;
        impact = 'LOW';
      } else {
        // Changed constraint
        if (isMinConstraint) {
          // For min constraints, increasing is more restrictive (breaking)
          breaking = newValue > oldValue;
        } else {
          // For max constraints, decreasing is more restrictive (breaking)
          breaking = newValue < oldValue;
        }
        
        description = `${constraintName} constraint changed for property '${propertyName}': ${oldValue} → ${newValue}`;
        impact = breaking ? 'HIGH' : 'MEDIUM';
      }

      const changeType: SchemaChangeType = breaking ? 'CONSTRAINT_TIGHTENED' : 'CONSTRAINT_RELAXED';

      changes.push({
        type: changeType,
        field: propertyName,
        breaking,
        direction: 'both',
        description,
        impact,
        oldValue,
        newValue,
        path: `${path}.${constraintName}`
      });
    }

    return changes;
  }

  /**
   * Check for type-level changes
   */
  private checkTypeChanges(oldSchema: JsonSchema, newSchema: JsonSchema): SchemaChange[] {
    const changes: SchemaChange[] = [];

    if (oldSchema.type !== newSchema.type) {
      const breaking = !this.areTypesCompatible(oldSchema.type!, newSchema.type!);
      changes.push({
        type: 'FIELD_TYPE_CHANGED',
        field: 'root',
        breaking,
        direction: 'both',
        description: `Root schema type changed from ${oldSchema.type} to ${newSchema.type}`,
        impact: breaking ? 'HIGH' : 'MEDIUM',
        oldValue: oldSchema.type,
        newValue: newSchema.type,
        path: '$.type'
      });
    }

    return changes;
  }

  /**
   * Check composition keyword changes (allOf, oneOf, anyOf)
   */
  private checkCompositionChanges(oldSchema: JsonSchema, newSchema: JsonSchema): SchemaChange[] {
    const changes: SchemaChange[] = [];

    // Check allOf changes
    if (!_.isEqual(oldSchema.allOf, newSchema.allOf)) {
      changes.push({
        type: 'SCHEMA_METADATA_CHANGED',
        field: 'allOf',
        breaking: true,
        direction: 'both',
        description: 'Schema composition (allOf) changed',
        impact: 'HIGH',
        path: '$.allOf'
      });
    }

    // Check oneOf changes
    if (!_.isEqual(oldSchema.oneOf, newSchema.oneOf)) {
      changes.push({
        type: 'SCHEMA_METADATA_CHANGED',
        field: 'oneOf',
        breaking: true,
        direction: 'both',
        description: 'Schema composition (oneOf) changed',
        impact: 'HIGH',
        path: '$.oneOf'
      });
    }

    return changes;
  }

  /**
   * Check for constraint-level changes
   */
  private checkConstraintChanges(oldSchema: JsonSchema, newSchema: JsonSchema): SchemaChange[] {
    const changes: SchemaChange[] = [];

    // Check additionalProperties changes
    if (oldSchema.additionalProperties !== newSchema.additionalProperties) {
      const oldAllows = oldSchema.additionalProperties !== false;
      const newAllows = newSchema.additionalProperties !== false;
      
      if (oldAllows && !newAllows) {
        changes.push({
          type: 'CONSTRAINT_ADDED',
          field: 'additionalProperties',
          breaking: true,
          direction: 'both',
          description: 'Additional properties are now forbidden',
          impact: 'HIGH',
          oldValue: oldSchema.additionalProperties,
          newValue: newSchema.additionalProperties,
          path: '$.additionalProperties'
        });
      } else if (!oldAllows && newAllows) {
        changes.push({
          type: 'CONSTRAINT_REMOVED',
          field: 'additionalProperties',
          breaking: false,
          direction: 'both',
          description: 'Additional properties are now allowed',
          impact: 'LOW',
          oldValue: oldSchema.additionalProperties,
          newValue: newSchema.additionalProperties,
          path: '$.additionalProperties'
        });
      }
    }

    return changes;
  }

  /**
   * Generate migration steps for the detected changes
   */
  private generateMigrationPath(changes: SchemaChange[]): MigrationStep[] {
    const steps: MigrationStep[] = [];

    changes.forEach(change => {
      switch (change.type) {
        case 'REQUIRED_FIELD_ADDED':
          steps.push({
            action: 'ADD_DEFAULT_VALUE',
            field: change.field,
            description: `Add default value for new required field '${change.field}'`,
            code: `"${change.field}": { "default": null }`,
            automated: false,
            complexity: 'MEDIUM'
          });
          break;

        case 'FIELD_TYPE_CHANGED':
          steps.push({
            action: 'TYPE_MIGRATION',
            field: change.field,
            description: `Migrate field '${change.field}' from ${change.oldValue} to ${change.newValue}`,
            code: `// Data migration required for ${change.field}`,
            automated: false,
            complexity: 'HIGH'
          });
          break;

        case 'CONSTRAINT_TIGHTENED':
          steps.push({
            action: 'VALIDATE_DATA',
            field: change.field,
            description: `Validate existing data meets new constraint for '${change.field}'`,
            code: `// Validate: ${change.description}`,
            automated: true,
            complexity: 'MEDIUM'
          });
          break;

        case 'ENUM_VALUE_REMOVED':
          steps.push({
            action: 'UPDATE_ENUM_VALUES',
            field: change.field,
            description: `Update existing data using removed enum value '${change.oldValue}'`,
            code: `// Update all instances of '${change.oldValue}' in field '${change.field}'`,
            automated: false,
            complexity: 'HIGH'
          });
          break;
      }
    });

    return steps;
  }

  /**
   * Assess risk level based on changes
   */
  private assessRisk(changes: SchemaChange[]): RiskAssessment {
    const breakingChanges = changes.filter(c => c.breaking);
    const highImpactChanges = changes.filter(c => c.impact === 'HIGH');

    let overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    
    if (breakingChanges.length === 0) {
      overallRisk = 'LOW';
    } else if (breakingChanges.length <= 2 && highImpactChanges.length <= 1) {
      overallRisk = 'MEDIUM';
    } else if (breakingChanges.length <= 5) {
      overallRisk = 'HIGH';
    } else {
      overallRisk = 'CRITICAL';
    }

    const recommendedActions = this.generateRecommendedActions(changes, overallRisk);
    const rollbackPlan = this.generateRollbackPlan(changes);

    return {
      overallRisk,
      breakingChanges: breakingChanges.length,
      recommendedActions,
      rollbackPlan
    };
  }

  /**
   * Generate recommended actions based on risk assessment
   */
  private generateRecommendedActions(changes: SchemaChange[], risk: string): string[] {
    const actions: string[] = [];

    if (risk === 'CRITICAL') {
      actions.push('Consider breaking this change into multiple smaller changes');
      actions.push('Implement feature flags for gradual rollout');
      actions.push('Plan comprehensive rollback strategy');
    }

    if (changes.some(c => c.type === 'REQUIRED_FIELD_ADDED')) {
      actions.push('Provide default values for new required fields');
      actions.push('Update all existing consumers before deploying');
    }

    if (changes.some(c => c.type === 'FIELD_TYPE_CHANGED')) {
      actions.push('Implement data migration scripts');
      actions.push('Test type conversions thoroughly');
    }

    if (changes.some(c => c.breaking)) {
      actions.push('Coordinate with all schema consumers');
      actions.push('Plan deployment sequence carefully');
      actions.push('Monitor error rates after deployment');
    }

    return actions;
  }

  /**
   * Generate rollback plan
   */
  private generateRollbackPlan(changes: SchemaChange[]): string[] {
    const plan: string[] = [];

    plan.push('Keep previous schema version available in registry');
    plan.push('Implement schema version fallback in consumers');
    
    if (changes.some(c => c.type === 'FIELD_TYPE_CHANGED')) {
      plan.push('Maintain data migration reversal scripts');
    }

    if (changes.some(c => c.breaking)) {
      plan.push('Test rollback procedure in staging environment');
      plan.push('Prepare communication plan for rollback');
    }

    return plan;
  }

  /**
   * Check compatibility level for specific changes
   */
  checkCompatibilityLevel(changes: SchemaChange[], level: CompatibilityLevel): boolean {
    switch (level) {
      case 'BACKWARD':
        return changes.every(c => !c.breaking || c.direction !== 'backward');
      case 'FORWARD':
        return changes.every(c => !c.breaking || c.direction !== 'forward');
      case 'FULL':
        return changes.every(c => !c.breaking);
      case 'NONE':
        return true;
      default:
        return false;
    }
  }
}