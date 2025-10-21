import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject as RxSubject, forkJoin } from 'rxjs';
import { takeUntil } from 'rxjs/operators';

import { SchemaRegistryService } from '../../../services/registry/schema-registry.service';
import { JsonSchemaCompatibilityService } from '../../../services/registry/compatibility.service';
import { SchemaBuilderService } from '../../../services/schema-builder.service';
import { 
  SchemaVersion, 
  EvolutionAnalysis,
  SchemaChange,
  CompatibilityLevel,
  PublishConfig,
  MigrationStep
} from '../../../models/schema-registry.models';
import { JsonSchema } from '../../../models/schema.models';

interface WizardStep {
  id: number;
  title: string;
  description: string;
  completed: boolean;
  valid: boolean;
}

interface EvolutionContext {
  subjectName: string;
  baseVersion: SchemaVersion;
  newSchema: JsonSchema;
  evolutionAnalysis: EvolutionAnalysis | null;
  compatibilityLevel: CompatibilityLevel;
  publishConfig: PublishConfig;
}

@Component({
  selector: 'app-schema-evolution-wizard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './schema-evolution-wizard.component.html',
  styleUrls: ['./schema-evolution-wizard.component.scss']
})
export class SchemaEvolutionWizardComponent implements OnInit, OnDestroy {
  private destroy$ = new RxSubject<void>();

  // Wizard state
  steps: WizardStep[] = [
    { id: 0, title: 'Select Base', description: 'Choose base schema version', completed: false, valid: false },
    { id: 1, title: 'Edit Schema', description: 'Make schema modifications', completed: false, valid: false },
    { id: 2, title: 'Analyze', description: 'Review compatibility', completed: false, valid: false },
    { id: 3, title: 'Configure', description: 'Set publish options', completed: false, valid: false },
    { id: 4, title: 'Publish', description: 'Review and publish', completed: false, valid: false }
  ];

  currentStep = 0;
  loading = false;
  error: string | null = null;

  // Evolution context
  context: EvolutionContext = {
    subjectName: '',
    baseVersion: {} as SchemaVersion,
    newSchema: {} as JsonSchema,
    evolutionAnalysis: null,
    compatibilityLevel: 'BACKWARD',
    publishConfig: {} as PublishConfig
  };

  // Component state
  availableVersions: SchemaVersion[] = [];
  showVersionSelector = false;
  schemaJson = '';
  jsonError: string | null = null;
  versionType: 'patch' | 'minor' | 'major' = 'minor';
  nextVersion = 1;
  validateCompatibility = true;
  createBackup = true;
  publishing = false;
  publishSuccess = false;
  publishResult: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private schemaRegistry: SchemaRegistryService,
    private compatibilityService: JsonSchemaCompatibilityService,
    private schemaBuilder: SchemaBuilderService
  ) {}

  ngOnInit(): void {
    this.route.params
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        this.context.subjectName = params['subjectName'];
        if (this.context.subjectName) {
          this.initialize();
        }
      });

    this.route.queryParams
      .pipe(takeUntil(this.destroy$))
      .subscribe(params => {
        if (params['fromVersion']) {
          // Set specific version as base
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async initialize(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      // Load available versions
      const versionNumbers = await this.schemaRegistry.getSubjectVersions(this.context.subjectName).toPromise() || [];
      
      this.availableVersions = await Promise.all(
        versionNumbers.map(async (versionNum): Promise<SchemaVersion> => {
          const version = await this.schemaRegistry.getSchemaVersion(this.context.subjectName, versionNum).toPromise();
          return version!;
        })
      );

      // Sort by version number (descending - newest first)
      this.availableVersions.sort((a, b) => b.version - a.version);

      // Auto-select latest version as base
      if (this.availableVersions.length > 0) {
        this.selectBaseVersion(this.availableVersions[0]);
      }

      // Initialize publish config
      this.context.publishConfig = {
        subject: this.context.subjectName,
        schema: {} as JsonSchema,
        compatibilityLevel: this.context.compatibilityLevel,
        references: []
      };

    } catch (error: any) {
      this.error = error.message || 'Failed to initialize evolution wizard';
      console.error('Error initializing wizard:', error);
    } finally {
      this.loading = false;
    }
  }

  selectBaseVersion(version: SchemaVersion): void {
    this.context.baseVersion = version;
    this.schemaJson = this.formatSchema(version.schema);
    this.context.newSchema = JSON.parse(version.schema);
    this.showVersionSelector = false;
    this.steps[0].completed = true;
    this.steps[0].valid = true;
    this.validateStep(1);
  }

  formatSchema(schema: string): string {
    try {
      const parsed = JSON.parse(schema);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return schema;
    }
  }

  onSchemaChange(): void {
    try {
      this.context.newSchema = JSON.parse(this.schemaJson);
      this.jsonError = null;
      this.steps[1].valid = true;
      
      // Trigger compatibility analysis
      this.analyzeCompatibility();
      
    } catch (error: any) {
      this.jsonError = error.message;
      this.steps[1].valid = false;
      this.context.evolutionAnalysis = null;
    }
  }

  private async analyzeCompatibility(): Promise<void> {
    if (!this.context.baseVersion || !this.context.newSchema) return;

    try {
      const baseSchema = JSON.parse(this.context.baseVersion.schema);
      this.context.evolutionAnalysis = this.compatibilityService.analyzeEvolution(
        baseSchema, 
        this.context.newSchema
      );
      
      this.steps[2].completed = true;
      this.steps[2].valid = true;
      this.validateStep(3);
      
    } catch (error) {
      console.error('Error analyzing compatibility:', error);
      this.context.evolutionAnalysis = null;
    }
  }

  getBreakingChangesCount(): number {
    return this.context.evolutionAnalysis ? 
      this.context.evolutionAnalysis.changes.filter(c => c.breaking).length : 0;
  }

  getNonBreakingChangesCount(): number {
    return this.context.evolutionAnalysis ? 
      this.context.evolutionAnalysis.changes.filter(c => !c.breaking).length : 0;
  }

  getRiskIcon(level: string): string {
    const icons: { [key: string]: string } = {
      'LOW': '✅',
      'MEDIUM': '⚠️',
      'HIGH': '🚨',
      'CRITICAL': '🔥'
    };
    return icons[level] || '❓';
  }

  updateVersionNumber(): void {
    const currentVersion = this.context.baseVersion?.version || 1;
    switch (this.versionType) {
      case 'patch':
        this.nextVersion = currentVersion + 1;
        break;
      case 'minor':
        this.nextVersion = Math.ceil(currentVersion / 10) * 10 + 10;
        break;
      case 'major':
        this.nextVersion = Math.ceil(currentVersion / 100) * 100 + 100;
        break;
    }
    this.validateStep(4);
  }

  hasCompatibilityWarning(): boolean {
    return this.context.compatibilityLevel === 'BACKWARD' && this.getBreakingChangesCount() > 0;
  }

  getCompatibilityWarning(): string {
    if (this.hasCompatibilityWarning()) {
      return 'Warning: Breaking changes detected but BACKWARD compatibility is selected. This may cause compatibility issues.';
    }
    return '';
  }

  loadSchemaInEditor(): void {
    // Navigate to visual editor with current schema
    this.router.navigate(['/schema-editor'], {
      queryParams: {
        mode: 'evolve',
        subject: this.context.subjectName,
        returnTo: '/registry/evolve/' + this.context.subjectName
      }
    });
  }

  importFromFile(): void {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (event: any) => {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (e: any) => {
          this.schemaJson = e.target.result;
          this.onSchemaChange();
        };
        reader.readAsText(file);
      }
    };
    input.click();
  }

  resetToBase(): void {
    if (this.context.baseVersion) {
      this.schemaJson = this.formatSchema(this.context.baseVersion.schema);
      this.onSchemaChange();
    }
  }

  async publishSchema(): Promise<void> {
    this.publishing = true;

    try {
      const publishConfig: PublishConfig = {
        subject: this.context.subjectName,
        schema: this.context.newSchema,
        compatibilityLevel: this.context.compatibilityLevel,
        references: []
      };

      this.publishResult = await this.schemaRegistry.registerJsonSchema(publishConfig).toPromise();
      this.publishSuccess = true;
      this.steps[4].completed = true;

    } catch (error: any) {
      console.error('Error publishing schema:', error);
      alert('Failed to publish schema: ' + (error.message || 'Unknown error'));
    } finally {
      this.publishing = false;
    }
  }

  saveDraft(): void {
    // Save current state to localStorage or backend
    const draft = {
      subjectName: this.context.subjectName,
      baseVersion: this.context.baseVersion.version,
      schema: this.schemaJson,
      timestamp: new Date().toISOString()
    };
    
    localStorage.setItem(`schema_draft_${this.context.subjectName}`, JSON.stringify(draft));
    alert('Draft saved successfully!');
  }

  canProceed(): boolean {
    return this.steps[this.currentStep]?.valid || false;
  }

  nextStep(): void {
    if (this.canProceed() && this.currentStep < this.steps.length - 1) {
      this.steps[this.currentStep].completed = true;
      this.currentStep++;
      
      if (this.currentStep === 3) {
        this.updateVersionNumber();
      }
    }
  }

  previousStep(): void {
    if (this.currentStep > 0) {
      this.currentStep--;
    }
  }

  private validateStep(stepIndex: number): void {
    switch (stepIndex) {
      case 1:
        this.steps[1].valid = !!this.context.baseVersion.id;
        break;
      case 2:
        this.steps[2].valid = !this.jsonError && !!this.context.newSchema;
        break;
      case 3:
        this.steps[3].valid = !!this.context.evolutionAnalysis;
        break;
      case 4:
        this.steps[4].valid = true;
        break;
    }
  }

  goBack(): void {
    this.router.navigate(['/registry/subject', this.context.subjectName, 'details']);
  }

  closeSuccessModal(): void {
    this.publishSuccess = false;
    this.router.navigate(['/registry/subject', this.context.subjectName, 'details']);
  }

  viewPublishedSchema(): void {
    this.publishSuccess = false;
    this.router.navigate(['/registry/subject', this.context.subjectName, 'version', this.nextVersion]);
  }
}