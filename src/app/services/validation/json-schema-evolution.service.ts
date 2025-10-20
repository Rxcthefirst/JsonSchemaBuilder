import { Injectable } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import { map, catchError } from 'rxjs/operators';

import { SchemaValidationService, ValidationResult, ValidationError, JsonSchemaDraft } from '../schema-validation.service';
import { JsonSchemaCompatibilityService } from '../registry/compatibility.service';
import { 
  JsonSchema, 
  SchemaProperty, 
  ValidationRule 
} from '../../models/schema.models';
import { 
  EvolutionAnalysis,
  SchemaChange,
  MigrationStep,
  RiskAssessment
} from '../../models/schema-registry.models';

export interface EvolutionValidationResult extends ValidationResult {
  evolutionAnalysis?: EvolutionAnalysis;
  migrationComplexity: 'SIMPLE' | 'MODERATE' | 'COMPLEX' | 'CRITICAL';
  riskAssessment: RiskAssessment;
  migrationEstimate: {
    estimatedTimeHours: number;
    confidence: number; // 0-1
    dependencies: string[];
    blockers: string[];
  };
}

export interface SchemaEvolutionContext {
  baseSchema: JsonSchema;
  candidateSchema: JsonSchema;
  targetDraft: JsonSchemaDraft;
  compatibilityMode: 'BACKWARD' | 'FORWARD' | 'FULL' | 'NONE';
  allowBreakingChanges: boolean;
  validateMigrationPath: boolean;
}

export interface EvolutionValidationOptions {
  strictMode: boolean;
  checkBackwardCompatibility: boolean;
  checkForwardCompatibility: boolean;
  validateMigrationSteps: boolean;
  generateMigrationCode: boolean;
  analyzePerformanceImpact: boolean;
  checkSemanticVersioning: boolean;
}

/**
 * Enhanced validation service for JSON Schema evolution scenarios
 */
@Injectable({
  providedIn: 'root'
})
export class JsonSchemaEvolutionService {
  
  constructor(
    private baseValidation: SchemaValidationService,
    private compatibilityService: JsonSchemaCompatibilityService
  ) {}

  /**
   * Comprehensive evolution validation that includes compatibility analysis
   */
  validateEvolution(
    context: SchemaEvolutionContext,
    options: Partial<EvolutionValidationOptions> = {}
  ): Observable<EvolutionValidationResult> {
    
    const opts: EvolutionValidationOptions = {
      strictMode: false,
      checkBackwardCompatibility: true,
      checkForwardCompatibility: false,
      validateMigrationSteps: true,
      generateMigrationCode: false,
      analyzePerformanceImpact: false,
      checkSemanticVersioning: true,
      ...options
    };

    try {
      // Step 1: Validate both schemas individually
      const baseValidation = this.baseValidation.validateSchema(context.baseSchema, context.targetDraft);
      const candidateValidation = this.baseValidation.validateSchema(context.candidateSchema, context.targetDraft);

      // If either schema is invalid and strict mode is on, fail fast
      if (opts.strictMode && (!baseValidation.isValid || !candidateValidation.isValid)) {
        return throwError('One or both schemas are invalid. Fix schema errors before analyzing evolution.');
      }

      // Step 2: Perform evolution analysis
      const evolutionAnalysis = this.compatibilityService.analyzeEvolution(
        context.baseSchema,
        context.candidateSchema
      );

      // Step 3: Check compatibility requirements
      const compatibilityErrors = this.validateCompatibilityRequirements(
        evolutionAnalysis,
        context,
        opts
      );

      // Step 4: Analyze migration complexity
      const migrationComplexity = this.assessMigrationComplexity(evolutionAnalysis);

      // Step 5: Generate risk assessment
      const riskAssessment = this.generateRiskAssessment(evolutionAnalysis, context);

      // Step 6: Estimate migration effort
      const migrationEstimate = this.estimateMigrationEffort(evolutionAnalysis, context);

      // Step 7: Validate migration path if requested
      const migrationErrors: ValidationError[] = [];
      if (opts.validateMigrationSteps) {
        migrationErrors.push(...this.validateMigrationPath(evolutionAnalysis.migrationPath));
      }

      // Step 8: Check semantic versioning compliance if requested
      const semanticVersioningErrors: ValidationError[] = [];
      if (opts.checkSemanticVersioning) {
        semanticVersioningErrors.push(...this.validateSemanticVersioning(evolutionAnalysis));
      }

      // Combine all validation results
      const allErrors = [
        ...baseValidation.errors,
        ...candidateValidation.errors,
        ...compatibilityErrors,
        ...migrationErrors,
        ...semanticVersioningErrors
      ];

      const allWarnings = [
        ...baseValidation.warnings,
        ...candidateValidation.warnings
      ];

      const result: EvolutionValidationResult = {
        isValid: allErrors.length === 0,
        errors: allErrors,
        warnings: allWarnings,
        draft: context.targetDraft,
        summary: {
          totalErrors: allErrors.length,
          totalWarnings: allWarnings.length,
          propertiesValidated: baseValidation.summary.propertiesValidated + candidateValidation.summary.propertiesValidated
        },
        evolutionAnalysis,
        migrationComplexity,
        riskAssessment,
        migrationEstimate
      };

      return of(result);

    } catch (error: any) {
      return throwError(`Evolution validation failed: ${error.message || error}`);
    }
  }

  /**
   * Quick compatibility check without full validation
   */
  checkCompatibility(
    baseSchema: JsonSchema,
    candidateSchema: JsonSchema,
    mode: 'BACKWARD' | 'FORWARD' | 'FULL' = 'BACKWARD'
  ): Observable<{ isCompatible: boolean; issues: string[] }> {
    
    try {
      const analysis = this.compatibilityService.analyzeEvolution(baseSchema, candidateSchema);
      const breakingChanges = analysis.changes.filter(c => c.breaking);
      
      let isCompatible: boolean;
      const issues: string[] = [];

      switch (mode) {
        case 'BACKWARD':
          isCompatible = analysis.isBackwardCompatible;
          if (!isCompatible) {
            issues.push(...breakingChanges.map(c => `Breaking change: ${c.description}`));
          }
          break;

        case 'FORWARD':
          isCompatible = analysis.isForwardCompatible;
          if (!isCompatible) {
            issues.push('Schema is not forward compatible');
          }
          break;

        case 'FULL':
          isCompatible = analysis.isBackwardCompatible && analysis.isForwardCompatible;
          if (!analysis.isBackwardCompatible) {
            issues.push(...breakingChanges.map(c => `Backward compatibility issue: ${c.description}`));
          }
          if (!analysis.isForwardCompatible) {
            issues.push('Forward compatibility issues detected');
          }
          break;

        default:
          isCompatible = true; // NONE mode
      }

      return of({ isCompatible, issues });

    } catch (error: any) {
      return throwError(`Compatibility check failed: ${error.message || error}`);
    }
  }

  /**
   * Generate migration recommendations
   */
  generateMigrationRecommendations(
    baseSchema: JsonSchema,
    candidateSchema: JsonSchema
  ): Observable<{
    recommendedSteps: MigrationStep[];
    alternativeApproaches: string[];
    riskMitigation: string[];
  }> {
    
    try {
      const analysis = this.compatibilityService.analyzeEvolution(baseSchema, candidateSchema);
      const breakingChanges = analysis.changes.filter(c => c.breaking);
      
      const recommendedSteps = [...analysis.migrationPath];
      
      // Add additional steps based on change analysis
      if (breakingChanges.length > 0) {
        recommendedSteps.unshift({
          action: 'Pre-migration Validation',
          field: 'root',
          description: 'Validate all existing data against the new schema constraints',
          code: 'schema.validate(existingData)',
          automated: true,
          complexity: 'MEDIUM'
        });
      }

      const alternativeApproaches = this.generateAlternativeApproaches(analysis);
      const riskMitigation = this.generateRiskMitigationSteps(analysis);

      return of({
        recommendedSteps,
        alternativeApproaches,
        riskMitigation
      });

    } catch (error: any) {
      return throwError(`Failed to generate migration recommendations: ${error.message || error}`);
    }
  }

  /**
   * Analyze breaking change impact
   */
  analyzeBreakingChangeImpact(
    changes: SchemaChange[]
  ): {
    highImpact: SchemaChange[];
    mediumImpact: SchemaChange[];
    lowImpact: SchemaChange[];
    mitigationStrategies: Map<string, string[]>;
  } {
    
    const highImpact = changes.filter(c => c.breaking && c.impact === 'HIGH');
    const mediumImpact = changes.filter(c => c.breaking && c.impact === 'MEDIUM');
    const lowImpact = changes.filter(c => c.breaking && c.impact === 'LOW');

    const mitigationStrategies = new Map<string, string[]>();

    // Generate mitigation strategies for each change type
    changes.forEach(change => {
      if (!change.breaking) return;
      
      const strategies: string[] = [];
      
      switch (change.type) {
        case 'FIELD_REMOVED':
          strategies.push('Implement gradual deprecation');
          strategies.push('Provide migration utilities');
          strategies.push('Use API versioning');
          break;
        
        case 'FIELD_TYPE_CHANGED':
          strategies.push('Use union types during transition');
          strategies.push('Implement data transformation layers');
          strategies.push('Provide backward-compatible parsers');
          break;
        
        case 'CONSTRAINT_ADDED':
          strategies.push('Validate existing data first');
          strategies.push('Implement data cleanup procedures');
          strategies.push('Use constraint relaxation periods');
          break;
      }

      if (strategies.length > 0) {
        mitigationStrategies.set(change.field || change.type, strategies);
      }
    });

    return {
      highImpact,
      mediumImpact,
      lowImpact,
      mitigationStrategies
    };
  }

  /**
   * Validate schema evolution best practices
   */
  validateEvolutionBestPractices(
    baseSchema: JsonSchema,
    candidateSchema: JsonSchema
  ): ValidationError[] {
    
    const errors: ValidationError[] = [];
    const analysis = this.compatibilityService.analyzeEvolution(baseSchema, candidateSchema);

    // Check for simultaneous breaking changes
    const breakingChanges = analysis.changes.filter(c => c.breaking);
    if (breakingChanges.length > 3) {
      errors.push({
        path: '$',
        message: 'Too many breaking changes in a single evolution',
        severity: 'warning',
        suggestion: 'Consider splitting changes across multiple releases'
      });
    }

    // Check for missing deprecation periods
    const removedFields = analysis.changes.filter(c => c.type === 'FIELD_REMOVED');
    if (removedFields.length > 0) {
      errors.push({
        path: '$',
        message: 'Field removals detected without deprecation information',
        severity: 'warning',
        suggestion: 'Add deprecation notices before removing fields'
      });
    }

    // Check for version bumps without changes
    if (analysis.changes.length === 0) {
      errors.push({
        path: '$',
        message: 'No changes detected between schema versions',
        severity: 'info',
        suggestion: 'Consider if a version bump is necessary'
      });
    }

    // Check for additive-only changes
    const additiveOnly = analysis.changes.every(c => !c.breaking);
    if (additiveOnly && analysis.changes.length > 0) {
      errors.push({
        path: '$',
        message: 'All changes are additive - consider minor version bump',
        severity: 'info',
        suggestion: 'Use semantic versioning for additive changes'
      });
    }

    return errors;
  }

  private validateCompatibilityRequirements(
    analysis: EvolutionAnalysis,
    context: SchemaEvolutionContext,
    options: EvolutionValidationOptions
  ): ValidationError[] {
    
    const errors: ValidationError[] = [];

    // Check backward compatibility if required
    if (options.checkBackwardCompatibility && !analysis.isBackwardCompatible) {
      if (!context.allowBreakingChanges) {
        errors.push({
          path: '$',
          message: 'Schema evolution breaks backward compatibility',
          severity: 'error',
          suggestion: 'Remove breaking changes or allow breaking changes in configuration'
        });
      }
    }

    // Check forward compatibility if required
    if (options.checkForwardCompatibility && !analysis.isForwardCompatible) {
      errors.push({
        path: '$',
        message: 'Schema evolution breaks forward compatibility',
        severity: 'error',
        suggestion: 'Ensure new schema can read data written with old schema'
      });
    }

    // Check compatibility mode requirements
    switch (context.compatibilityMode) {
      case 'FULL':
        if (!analysis.isBackwardCompatible || !analysis.isForwardCompatible) {
          errors.push({
            path: '$',
            message: 'Full compatibility mode requires both backward and forward compatibility',
            severity: 'error'
          });
        }
        break;

      case 'BACKWARD':
        if (!analysis.isBackwardCompatible && !context.allowBreakingChanges) {
          errors.push({
            path: '$',
            message: 'Backward compatibility mode violated',
            severity: 'error'
          });
        }
        break;

      case 'FORWARD':
        if (!analysis.isForwardCompatible) {
          errors.push({
            path: '$',
            message: 'Forward compatibility mode violated',
            severity: 'error'
          });
        }
        break;
    }

    return errors;
  }

  private assessMigrationComplexity(analysis: EvolutionAnalysis): 'SIMPLE' | 'MODERATE' | 'COMPLEX' | 'CRITICAL' {
    const breakingChanges = analysis.changes.filter(c => c.breaking).length;
    const totalChanges = analysis.changes.length;
    const migrationSteps = analysis.migrationPath.length;

    if (breakingChanges === 0 && totalChanges <= 3) {
      return 'SIMPLE';
    }
    
    if (breakingChanges <= 2 && migrationSteps <= 5) {
      return 'MODERATE';
    }
    
    if (breakingChanges <= 5 && migrationSteps <= 10) {
      return 'COMPLEX';
    }
    
    return 'CRITICAL';
  }

  private generateRiskAssessment(analysis: EvolutionAnalysis, context: SchemaEvolutionContext): RiskAssessment {
    const breakingChanges = analysis.changes.filter(c => c.breaking);
    const highImpactChanges = breakingChanges.filter(c => c.impact === 'HIGH');
    
    let overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'LOW';
    
    if (highImpactChanges.length > 2) {
      overallRisk = 'CRITICAL';
    } else if (breakingChanges.length >= 3 || highImpactChanges.length > 0) {
      overallRisk = 'HIGH';
    } else if (breakingChanges.length > 0) {
      overallRisk = 'MEDIUM';
    }

    const recommendedActions: string[] = [];
    
    if (overallRisk === 'CRITICAL') {
      recommendedActions.push('Immediate review required');
      recommendedActions.push('Consider phased rollout');
      recommendedActions.push('Prepare rollback procedures');
    } else if (overallRisk === 'HIGH') {
      recommendedActions.push('Thorough testing recommended');
      recommendedActions.push('Stakeholder approval required');
    } else if (overallRisk === 'MEDIUM') {
      recommendedActions.push('Standard testing procedures');
      recommendedActions.push('Monitor deployment closely');
    }

    return {
      overallRisk,
      breakingChanges: breakingChanges.length,
      recommendedActions
    };
  }

  private estimateMigrationEffort(analysis: EvolutionAnalysis, context: SchemaEvolutionContext) {
    const breakingChanges = analysis.changes.filter(c => c.breaking).length;
    const totalChanges = analysis.changes.length;
    
    // Base estimation in hours
    let estimatedTimeHours = 2; // Base setup time
    
    // Add time for each change
    estimatedTimeHours += totalChanges * 0.5; // 30 min per change
    estimatedTimeHours += breakingChanges * 2; // 2 hours per breaking change
    estimatedTimeHours += analysis.migrationPath.length * 1; // 1 hour per migration step

    // Confidence based on complexity
    let confidence = 0.9;
    if (breakingChanges > 3) confidence -= 0.3;
    if (totalChanges > 10) confidence -= 0.2;
    if (analysis.migrationPath.length > 5) confidence -= 0.1;

    const dependencies = this.extractDependencies(analysis);
    const blockers = analysis.changes
      .filter(c => c.breaking && c.impact === 'HIGH')
      .map(c => c.description);

    return {
      estimatedTimeHours: Math.round(estimatedTimeHours * 10) / 10,
      confidence: Math.max(0.1, confidence),
      dependencies,
      blockers
    };
  }

  private validateMigrationPath(migrationPath: MigrationStep[]): ValidationError[] {
    const errors: ValidationError[] = [];

    if (migrationPath.length === 0) {
      errors.push({
        path: '$.migrationPath',
        message: 'No migration path provided for schema evolution',
        severity: 'warning',
        suggestion: 'Provide migration steps for better guidance'
      });
    }

    // Check for missing critical steps
    const hasDataValidation = migrationPath.some(step => 
      step.action.toLowerCase().includes('validat') || 
      step.description.toLowerCase().includes('validat')
    );
    
    if (!hasDataValidation) {
      errors.push({
        path: '$.migrationPath',
        message: 'Migration path missing data validation step',
        severity: 'warning',
        suggestion: 'Add data validation to migration steps'
      });
    }

    return errors;
  }

  private validateSemanticVersioning(analysis: EvolutionAnalysis): ValidationError[] {
    const errors: ValidationError[] = [];
    const breakingChanges = analysis.changes.filter(c => c.breaking);

    if (breakingChanges.length > 0) {
      errors.push({
        path: '$',
        message: 'Breaking changes require major version bump',
        severity: 'info',
        suggestion: 'Use semantic versioning: increment major version for breaking changes'
      });
    } else if (analysis.changes.length > 0) {
      errors.push({
        path: '$',
        message: 'Non-breaking changes suggest minor version bump',
        severity: 'info',
        suggestion: 'Use semantic versioning: increment minor version for new features'
      });
    }

    return errors;
  }

  private generateAlternativeApproaches(analysis: EvolutionAnalysis): string[] {
    const alternatives: string[] = [];
    const breakingChanges = analysis.changes.filter(c => c.breaking);

    if (breakingChanges.length > 0) {
      alternatives.push('Gradual Migration: Implement changes across multiple releases');
      alternatives.push('Dual Schema Support: Maintain both old and new schemas temporarily');
      alternatives.push('API Versioning: Create new version while maintaining old version');
      alternatives.push('Feature Flags: Use feature toggles to control schema usage');
    }

    if (analysis.changes.some(c => c.type === 'FIELD_REMOVED')) {
      alternatives.push('Deprecation Period: Mark fields as deprecated before removal');
      alternatives.push('Optional Migration: Make removed fields optional first');
    }

    return alternatives;
  }

  private generateRiskMitigationSteps(analysis: EvolutionAnalysis): string[] {
    const steps: string[] = [];
    const breakingChanges = analysis.changes.filter(c => c.breaking);

    if (breakingChanges.length > 0) {
      steps.push('Implement comprehensive testing strategy');
      steps.push('Create rollback procedures');
      steps.push('Set up monitoring and alerting');
      steps.push('Prepare migration documentation');
      steps.push('Conduct stakeholder review');
    }

    if (analysis.changes.some(c => c.impact === 'HIGH')) {
      steps.push('Perform canary deployment');
      steps.push('Implement circuit breakers');
      steps.push('Prepare emergency response plan');
    }

    return steps;
  }

  private extractDependencies(analysis: EvolutionAnalysis): string[] {
    const dependencies: string[] = [];
    
    // Look for schema references that might indicate dependencies
    analysis.changes.forEach(change => {
      if (change.field?.includes('$ref')) {
        dependencies.push(`Schema reference: ${change.field}`);
      }
      
      if (change.type === 'FIELD_TYPE_CHANGED') {
        dependencies.push(`Type system changes for: ${change.field}`);
      }
    });

    return dependencies;
  }
}