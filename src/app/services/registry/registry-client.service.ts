import { Injectable } from '@angular/core';
import { Observable, combineLatest, of } from 'rxjs';
import { map, switchMap, catchError } from 'rxjs/operators';
import { SchemaRegistryService } from './schema-registry.service.js';
import { JsonSchemaCompatibilityService } from './compatibility.service.js';
import {
  Subject,
  SchemaVersion,
  EvolutionAnalysis,
  PublishConfig,
  PublishResult,
  CompatibilityLevel
} from '../../models/schema-registry.models.js';
import { JsonSchema } from '../../models/schema.models.js';

/**
 * High-level client service that provides convenient methods for Schema Registry operations
 * This service combines the core registry operations with evolution analysis
 */
@Injectable({
  providedIn: 'root'
})
export class RegistryClientService {

  constructor(
    private registryService: SchemaRegistryService,
    private compatibilityService: JsonSchemaCompatibilityService
  ) {}

  /**
   * Get enhanced subject information with evolution details
   */
  getSubjectWithEvolution(subjectName: string): Observable<Subject & { evolutionSummary?: any }> {
    return this.registryService.getSubjectDetails(subjectName).pipe(
      switchMap((subject: Subject) => {
        if (subject.versions && subject.versions.length > 1) {
          // Get the last two versions for evolution analysis
          const latestVersion = Math.max(...subject.versions);
          const previousVersion = subject.versions
            .filter(v => v < latestVersion)
            .reduce((max, current) => Math.max(max, current), 0);

          if (previousVersion > 0) {
            return this.getEvolutionAnalysis(subjectName, previousVersion, latestVersion).pipe(
              map(evolution => ({
                ...subject,
                evolutionSummary: {
                  totalChanges: evolution.changes.length,
                  breakingChanges: evolution.changes.filter(c => c.breaking).length,
                  riskLevel: evolution.riskAssessment.overallRisk,
                  isBackwardCompatible: evolution.isBackwardCompatible,
                  isForwardCompatible: evolution.isForwardCompatible
                }
              })),
              catchError(() => of(subject))
            );
          }
        }
        return of(subject);
      })
    );
  }

  /**
   * Get evolution analysis between two schema versions
   */
  getEvolutionAnalysis(
    subjectName: string, 
    oldVersion: number, 
    newVersion: number
  ): Observable<EvolutionAnalysis> {
    return combineLatest([
      this.registryService.getSchemaVersion(subjectName, oldVersion),
      this.registryService.getSchemaVersion(subjectName, newVersion)
    ]).pipe(
      map(([oldSchemaVersion, newSchemaVersion]: [SchemaVersion, SchemaVersion]) => {
        const oldSchema: JsonSchema = JSON.parse(oldSchemaVersion.schema);
        const newSchema: JsonSchema = JSON.parse(newSchemaVersion.schema);
        return this.compatibilityService.analyzeEvolution(oldSchema, newSchema);
      })
    );
  }

  /**
   * Publish schema with comprehensive validation and evolution analysis
   */
  publishSchemaWithAnalysis(config: PublishConfig): Observable<PublishResult & { evolution?: EvolutionAnalysis }> {
    // First check if subject exists and get latest version for evolution analysis
    return this.registryService.getSubjects().pipe(
      switchMap((subjects: string[]) => {
        if (subjects.includes(config.subject)) {
          // Subject exists, get latest version for comparison
          return this.registryService.getSchemaVersion(config.subject, 'latest').pipe(
            map((latestVersion: SchemaVersion) => {
              const existingSchema: JsonSchema = JSON.parse(latestVersion.schema);
              const evolution = this.compatibilityService.analyzeEvolution(existingSchema, config.schema as JsonSchema);
              return { existingSchema, evolution };
            }),
            catchError(() => of({ existingSchema: null, evolution: null }))
          );
        } else {
          // New subject
          return of({ existingSchema: null, evolution: null });
        }
      }),
      switchMap(({ existingSchema, evolution }) => {
        // Proceed with registration
        return this.registryService.registerJsonSchema(config).pipe(
          map((result: PublishResult) => ({
            ...result,
            evolution: evolution || undefined
          }))
        );
      })
    );
  }

  /**
   * Validate schema against a specific compatibility level
   */
  validateSchemaCompatibility(
    subjectName: string, 
    schema: JsonSchema, 
    compatibilityLevel: CompatibilityLevel = 'BACKWARD'
  ): Observable<{ isCompatible: boolean; analysis?: EvolutionAnalysis; errors: string[] }> {
    return this.registryService.getSubjects().pipe(
      switchMap((subjects: string[]) => {
        if (!subjects.includes(subjectName)) {
          // New subject, no compatibility issues
          return of({
            isCompatible: true,
            errors: []
          });
        }

        // Get latest version and compare
        return this.registryService.getSchemaVersion(subjectName, 'latest').pipe(
          map((latestVersion: SchemaVersion) => {
            const existingSchema: JsonSchema = JSON.parse(latestVersion.schema);
            const evolution = this.compatibilityService.analyzeEvolution(existingSchema, schema);
            
            // Check if changes are compatible with the specified level
            const isCompatible = this.compatibilityService.checkCompatibilityLevel(
              evolution.changes, 
              compatibilityLevel
            );

            const errors: string[] = [];
            if (!isCompatible) {
              const breakingChanges = evolution.changes.filter(c => c.breaking);
              errors.push(...breakingChanges.map(c => c.description));
            }

            return {
              isCompatible,
              analysis: evolution,
              errors
            };
          }),
          catchError((error) => of({
            isCompatible: false,
            errors: [`Failed to validate compatibility: ${error.message}`]
          }))
        );
      })
    );
  }

  /**
   * Get schema lineage (all versions with their relationships)
   */
  getSchemaLineage(subjectName: string): Observable<{
    versions: SchemaVersion[];
    evolutionHistory: { from: number; to: number; analysis: EvolutionAnalysis }[];
  }> {
    return this.registryService.getSubjectVersions(subjectName).pipe(
      switchMap((versions: number[]) => {
        // Get all versions
        const versionRequests = versions.map(v => 
          this.registryService.getSchemaVersion(subjectName, v)
        );
        
        return combineLatest(versionRequests).pipe(
          map((schemaVersions: SchemaVersion[]) => {
            // Sort by version number
            schemaVersions.sort((a, b) => a.version - b.version);
            
            // Build evolution history between consecutive versions
            const evolutionHistory: { from: number; to: number; analysis: EvolutionAnalysis }[] = [];
            
            for (let i = 0; i < schemaVersions.length - 1; i++) {
              const fromSchema: JsonSchema = JSON.parse(schemaVersions[i].schema);
              const toSchema: JsonSchema = JSON.parse(schemaVersions[i + 1].schema);
              const analysis = this.compatibilityService.analyzeEvolution(fromSchema, toSchema);
              
              evolutionHistory.push({
                from: schemaVersions[i].version,
                to: schemaVersions[i + 1].version,
                analysis
              });
            }
            
            return {
              versions: schemaVersions,
              evolutionHistory
            };
          })
        );
      })
    );
  }

  /**
   * Search subjects by pattern or metadata
   */
  searchSubjects(pattern?: string, tags?: { [key: string]: string }): Observable<Subject[]> {
    return this.registryService.getSubjects().pipe(
      switchMap((subjectNames: string[]) => {
        // Filter by pattern if provided
        let filteredNames = subjectNames;
        if (pattern) {
          const regex = new RegExp(pattern, 'i');
          filteredNames = subjectNames.filter(name => regex.test(name));
        }
        
        // Get detailed information for each filtered subject
        const subjectRequests = filteredNames.map(name => 
          this.registryService.getSubjectDetails(name)
        );
        
        if (subjectRequests.length === 0) {
          return of([]);
        }
        
        return combineLatest(subjectRequests);
      })
    );
  }

  /**
   * Bulk operation: Get compatibility status for multiple subjects
   */
  getCompatibilityStatus(subjectNames: string[]): Observable<{
    subject: string;
    compatibilityLevel: CompatibilityLevel;
    latestVersion: number;
    hasIssues: boolean;
  }[]> {
    const requests = subjectNames.map(subjectName => 
      combineLatest([
        this.registryService.getSubjectCompatibility(subjectName),
        this.registryService.getSubjectVersions(subjectName)
      ]).pipe(
        map(([compatibility, versions]: [CompatibilityLevel, number[]]) => ({
          subject: subjectName,
          compatibilityLevel: compatibility,
          latestVersion: Math.max(...versions),
          hasIssues: false // Could be enhanced with actual issue detection
        })),
        catchError(() => of({
          subject: subjectName,
          compatibilityLevel: 'NONE' as CompatibilityLevel,
          latestVersion: 0,
          hasIssues: true
        }))
      )
    );
    
    return combineLatest(requests);
  }

  /**
   * Check if registry is properly configured and accessible
   */
  getRegistryHealth(): Observable<{
    connected: boolean;
    version?: string;
    mode?: string;
    subjectCount: number;
    error?: string;
  }> {
    return this.registryService.testConnection().pipe(
      switchMap((status) => {
        if (!status.connected) {
          return of({
            connected: false,
            subjectCount: 0,
            error: status.error
          });
        }
        
        return this.registryService.getSubjects().pipe(
          map((subjects: string[]) => ({
            connected: true,
            version: status.version,
            mode: status.mode,
            subjectCount: subjects.length
          })),
          catchError(() => of({
            connected: false,
            subjectCount: 0,
            error: 'Failed to retrieve subjects'
          }))
        );
      })
    );
  }

  /**
   * Get evolution recommendations for a schema change
   */
  getEvolutionRecommendations(
    subjectName: string, 
    proposedSchema: JsonSchema
  ): Observable<{
    recommendations: string[];
    migrationSteps: any[];
    alternativeApproaches: string[];
    riskMitigation: string[];
  }> {
    return this.validateSchemaCompatibility(subjectName, proposedSchema).pipe(
      map(({ analysis, isCompatible }) => {
        if (!analysis) {
          return {
            recommendations: ['This is a new schema with no compatibility concerns'],
            migrationSteps: [],
            alternativeApproaches: [],
            riskMitigation: []
          };
        }

        const recommendations: string[] = [];
        const alternativeApproaches: string[] = [];
        const riskMitigation: string[] = [];

        if (!isCompatible) {
          recommendations.push('Consider making changes backward compatible');
          recommendations.push('Plan a coordinated deployment with consumers');
        }

        if (analysis.changes.some(c => c.type === 'REQUIRED_FIELD_ADDED')) {
          alternativeApproaches.push('Make new fields optional with sensible defaults');
          alternativeApproaches.push('Use a two-phase deployment approach');
        }

        if (analysis.riskAssessment.overallRisk === 'HIGH' || analysis.riskAssessment.overallRisk === 'CRITICAL') {
          riskMitigation.push('Implement feature toggles for gradual rollout');
          riskMitigation.push('Prepare comprehensive rollback plan');
          riskMitigation.push('Increase monitoring and alerting during deployment');
        }

        return {
          recommendations,
          migrationSteps: analysis.migrationPath,
          alternativeApproaches,
          riskMitigation: riskMitigation.concat(analysis.riskAssessment.recommendedActions)
        };
      })
    );
  }
}