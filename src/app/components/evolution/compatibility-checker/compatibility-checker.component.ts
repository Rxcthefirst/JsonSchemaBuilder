import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subject as RxSubject, debounceTime, distinctUntilChanged, switchMap, of, EMPTY } from 'rxjs';
import { takeUntil, catchError } from 'rxjs/operators';

import { SchemaRegistryService } from '../../../services/registry/schema-registry.service';
import { JsonSchemaCompatibilityService } from '../../../services/registry/compatibility.service';
import { 
  SchemaVersion,
  EvolutionAnalysis,
  SchemaChange
} from '../../../models/schema-registry.models';

interface CompatibilityTest {
  id: string;
  name: string;
  description: string;
  subjectName?: string;
  baseSchema: any;
  candidateSchema: any;
  compatibilityMode: 'BACKWARD' | 'FORWARD' | 'FULL' | 'NONE';
  analysis: EvolutionAnalysis | null;
  status: 'pending' | 'running' | 'completed' | 'error';
  error?: string;
  createdAt: Date;
}

interface TestResult {
  isCompatible: boolean;
  breakingChanges: SchemaChange[];
  warnings: SchemaChange[];
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  details: string[];
}

@Component({
  selector: 'app-compatibility-checker',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './compatibility-checker.component.html',
  styleUrls: ['./compatibility-checker.component.scss']
})
export class CompatibilityCheckerComponent implements OnInit, OnDestroy {
  private destroy$ = new RxSubject<void>();
  private subjectSearchTerm$ = new RxSubject<string>();

  testForm: FormGroup;
  isRunningTest = false;

  // Schema validation
  baseSchemaValid: boolean | null = null;
  baseSchemaError = '';
  candidateSchemaValid: boolean | null = null;
  candidateSchemaError = '';

  // Subject suggestions
  subjectSuggestions: string[] = [];
  availableVersions: SchemaVersion[] = [];

  // Current test
  currentTest: CompatibilityTest | null = null;

  // Results filtering
  resultsFilter = '';
  filteredResults: SchemaChange[] = [];

  // Test history
  testHistory: CompatibilityTest[] = [];
  filteredHistory: CompatibilityTest[] = [];
  historySearchTerm = '';

  constructor(
    private formBuilder: FormBuilder,
    private schemaRegistry: SchemaRegistryService,
    private compatibilityService: JsonSchemaCompatibilityService
  ) {
    this.testForm = this.formBuilder.group({
      testName: ['', Validators.required],
      description: [''],
      baseSource: ['manual', Validators.required],
      subjectName: [''],
      baseVersion: [''],
      baseSchema: ['', Validators.required],
      candidateSchema: ['', Validators.required],
      compatibilityMode: ['BACKWARD', Validators.required]
    });
  }

  ngOnInit(): void {
    this.setupSubjectSearch();
    this.loadTestHistory();
    this.setupFormValidation();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSubjectSearch(): void {
    this.subjectSearchTerm$
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(300),
        distinctUntilChanged(),
        switchMap(term => {
          if (!term || term.length < 2) return of([]);
          // Since searchSubjects method doesn't exist, use getSubjects and filter
          return this.schemaRegistry.getSubjects().pipe(
            switchMap(subjects => of((subjects as string[]).filter((s: string) => s.toLowerCase().includes(term.toLowerCase())))),
            catchError(() => of([]))
          );
        })
      )
      .subscribe(subjects => {
        this.subjectSuggestions = subjects;
      });
  }

  private setupFormValidation(): void {
    // Update base schema requirement based on source
    this.testForm.get('baseSource')?.valueChanges.subscribe(source => {
      const baseSchemaControl = this.testForm.get('baseSchema');
      const subjectControl = this.testForm.get('subjectName');
      const versionControl = this.testForm.get('baseVersion');

      if (source === 'registry') {
        baseSchemaControl?.clearValidators();
        subjectControl?.setValidators([Validators.required]);
        versionControl?.setValidators([Validators.required]);
      } else {
        baseSchemaControl?.setValidators([Validators.required]);
        subjectControl?.clearValidators();
        versionControl?.clearValidators();
      }

      baseSchemaControl?.updateValueAndValidity();
      subjectControl?.updateValueAndValidity();
      versionControl?.updateValueAndValidity();
    });

    // Auto-validate schemas
    this.testForm.get('baseSchema')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500)
      )
      .subscribe(schema => {
        if (schema && this.testForm.get('baseSource')?.value === 'manual') {
          this.validateSchema('base');
        }
      });

    this.testForm.get('candidateSchema')?.valueChanges
      .pipe(
        takeUntil(this.destroy$),
        debounceTime(500)
      )
      .subscribe(() => {
        this.validateSchema('candidate');
      });
  }

  onBaseSourceChange(): void {
    this.baseSchemaValid = null;
    this.availableVersions = [];
    this.subjectSuggestions = [];
  }

  onSubjectSearch(event: any): void {
    const term = event.target.value;
    this.subjectSearchTerm$.next(term);
    
    if (term && term.length >= 2) {
      this.loadSubjectVersions(term);
    }
  }

  selectSubject(subjectName: string): void {
    this.testForm.patchValue({ subjectName });
    this.subjectSuggestions = [];
    this.loadSubjectVersions(subjectName);
  }

  private async loadSubjectVersions(subjectName: string): Promise<void> {
    try {
      const versionNumbers = await this.schemaRegistry.getSubjectVersions(subjectName).toPromise() || [];
      
      this.availableVersions = await Promise.all(
        versionNumbers.map(async (versionNum): Promise<SchemaVersion> => {
          const version = await this.schemaRegistry.getSchemaVersion(subjectName, versionNum).toPromise();
          return version!;
        })
      );

      this.availableVersions.sort((a, b) => b.version - a.version);
    } catch (error) {
      console.error('Error loading versions:', error);
      this.availableVersions = [];
    }
  }

  validateSchema(type: 'base' | 'candidate'): void {
    const schemaValue = this.testForm.get(`${type}Schema`)?.value;
    
    if (!schemaValue?.trim()) {
      if (type === 'base') {
        this.baseSchemaValid = null;
        this.baseSchemaError = '';
      } else {
        this.candidateSchemaValid = null;
        this.candidateSchemaError = '';
      }
      return;
    }

    try {
      const parsed = JSON.parse(schemaValue);
      
      // Basic JSON Schema validation
      if (!parsed || typeof parsed !== 'object') {
        throw new Error('Must be a valid JSON object');
      }

      if (type === 'base') {
        this.baseSchemaValid = true;
        this.baseSchemaError = '';
      } else {
        this.candidateSchemaValid = true;
        this.candidateSchemaError = '';
      }
    } catch (error: any) {
      if (type === 'base') {
        this.baseSchemaValid = false;
        this.baseSchemaError = error.message;
      } else {
        this.candidateSchemaValid = false;
        this.candidateSchemaError = error.message;
      }
    }
  }

  formatSchema(type: 'base' | 'candidate'): void {
    const control = this.testForm.get(`${type}Schema`);
    const value = control?.value;

    if (!value?.trim()) return;

    try {
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 2);
      control?.setValue(formatted);
    } catch (error) {
      alert('Invalid JSON - cannot format');
    }
  }

  clearSchema(type: 'base' | 'candidate'): void {
    this.testForm.get(`${type}Schema`)?.setValue('');
  }

  async runCompatibilityTest(): Promise<void> {
    if (!this.testForm.valid) return;

    this.isRunningTest = true;

    try {
      const formValue = this.testForm.value;
      
      // Create new test
      const test: CompatibilityTest = {
        id: this.generateTestId(),
        name: formValue.testName,
        description: formValue.description,
        subjectName: formValue.baseSource === 'registry' ? formValue.subjectName : undefined,
        baseSchema: await this.getBaseSchema(),
        candidateSchema: JSON.parse(formValue.candidateSchema),
        compatibilityMode: formValue.compatibilityMode,
        analysis: null,
        status: 'running',
        createdAt: new Date()
      };

      this.currentTest = test;
      this.addToHistory(test);

      // Run analysis
      const analysis = this.compatibilityService.analyzeEvolution(
        test.baseSchema,
        test.candidateSchema
      );

      // Update test with results
      test.analysis = analysis;
      test.status = 'completed';
      this.filteredResults = [...analysis.changes];

    } catch (error: any) {
      if (this.currentTest) {
        this.currentTest.status = 'error';
        this.currentTest.error = error.message;
      }
    } finally {
      this.isRunningTest = false;
    }
  }

  private async getBaseSchema(): Promise<any> {
    const formValue = this.testForm.value;

    if (formValue.baseSource === 'registry') {
      const version = await this.schemaRegistry.getSchemaVersion(
        formValue.subjectName,
        formValue.baseVersion
      ).toPromise();
      return JSON.parse(version!.schema);
    } else {
      return JSON.parse(formValue.baseSchema);
    }
  }

  retryTest(): void {
    if (this.currentTest) {
      this.runCompatibilityTest();
    }
  }

  resetForm(): void {
    this.testForm.reset({
      baseSource: 'manual',
      compatibilityMode: 'BACKWARD'
    });
    this.currentTest = null;
    this.baseSchemaValid = null;
    this.candidateSchemaValid = null;
    this.availableVersions = [];
    this.subjectSuggestions = [];
  }

  // Results methods
  getStatusText(): string {
    if (!this.currentTest) return '';

    switch (this.currentTest.status) {
      case 'running': return 'Running analysis...';
      case 'completed': return 'Analysis complete';
      case 'error': return 'Analysis failed';
      default: return 'Pending';
    }
  }

  getCompatibilityMessage(): string {
    if (!this.currentTest?.analysis) return '';

    const { isBackwardCompatible, changes } = this.currentTest.analysis;
    const breakingCount = changes.filter(c => c.breaking).length;

    if (isBackwardCompatible) {
      return `Schema is ${this.currentTest.compatibilityMode.toLowerCase()} compatible. All changes are non-breaking.`;
    } else {
      return `Schema is not ${this.currentTest.compatibilityMode.toLowerCase()} compatible. Found ${breakingCount} breaking change${breakingCount !== 1 ? 's' : ''}.`;
    }
  }

  getBreakingChanges(): SchemaChange[] {
    return this.currentTest?.analysis?.changes.filter(c => c.breaking) || [];
  }

  getWarningChanges(): SchemaChange[] {
    return this.currentTest?.analysis?.changes.filter(c => !c.breaking && c.impact !== 'LOW') || [];
  }

  getRiskLevel(): string {
    const breakingCount = this.getBreakingChanges().length;
    const warningCount = this.getWarningChanges().length;

    if (breakingCount > 0) return 'HIGH';
    if (warningCount > 2) return 'MEDIUM';
    return 'LOW';
  }

  getRiskIcon(): string {
    switch (this.getRiskLevel()) {
      case 'HIGH': return '🔴';
      case 'MEDIUM': return '🟡';
      default: return '🟢';
    }
  }

  applyResultsFilter(): void {
    if (!this.currentTest?.analysis) return;

    const allChanges = this.currentTest.analysis.changes;

    switch (this.resultsFilter) {
      case 'breaking':
        this.filteredResults = allChanges.filter(c => c.breaking);
        break;
      case 'warnings':
        this.filteredResults = allChanges.filter(c => !c.breaking && c.impact !== 'LOW');
        break;
      case 'safe':
        this.filteredResults = allChanges.filter(c => !c.breaking && c.impact === 'LOW');
        break;
      default:
        this.filteredResults = [...allChanges];
    }
  }

  getFilteredResults(): SchemaChange[] {
    return this.filteredResults;
  }

  isWarningChange(change: SchemaChange): boolean {
    return !change.breaking && change.impact !== 'LOW';
  }

  getMitigationAdvice(change: SchemaChange): string | null {
    // Provide contextual advice based on change type
    const changeType = change.type as string;
    switch (changeType) {
      case 'FIELD_REMOVED':
        return 'Consider making the field optional first, then remove in a future version.';
      case 'REQUIRED_ADDED':
        return 'Provide default values for new required fields or make them optional initially.';
      case 'FIELD_TYPE_CHANGED':
        return 'Use union types or gradual migration to avoid breaking existing consumers.';
      case 'CONSTRAINT_ADDED':
        return 'Ensure existing data complies with new constraints before deployment.';
      case 'CONSTRAINT_REMOVED':
        return 'Validate that removing constraints won\'t affect data integrity.';
      default:
        return null;
    }
  }

  formatChangeValue(value: any): string {
    if (value === null) return 'null';
    if (value === undefined) return 'undefined';
    if (typeof value === 'string') return `"${value}"`;
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  }

  exportResults(format: 'json' | 'report'): void {
    if (!this.currentTest?.analysis) return;

    const timestamp = new Date().toISOString();
    let content: string;
    let filename: string;
    let mimeType: string;

    if (format === 'json') {
      content = JSON.stringify({
        test: {
          name: this.currentTest.name,
          description: this.currentTest.description,
          compatibilityMode: this.currentTest.compatibilityMode,
          timestamp: this.currentTest.createdAt.toISOString()
        },
        result: {
          isCompatible: this.currentTest.analysis.isBackwardCompatible,
          riskLevel: this.getRiskLevel(),
          totalChanges: this.currentTest.analysis.changes.length,
          breakingChanges: this.getBreakingChanges().length
        },
        changes: this.currentTest.analysis.changes,
        migrationPath: this.currentTest.analysis.migrationPath
      }, null, 2);
      filename = `compatibility-test-${timestamp.split('T')[0]}.json`;
      mimeType = 'application/json';
    } else {
      // Generate text report
      const breaking = this.getBreakingChanges();
      const warnings = this.getWarningChanges();
      
      content = `Schema Compatibility Test Report
Generated: ${timestamp}

Test Details:
- Name: ${this.currentTest.name}
- Mode: ${this.currentTest.compatibilityMode}
- Result: ${this.currentTest.analysis.isBackwardCompatible ? 'COMPATIBLE' : 'INCOMPATIBLE'}
- Risk Level: ${this.getRiskLevel()}

Summary:
- Total Changes: ${this.currentTest.analysis.changes.length}
- Breaking Changes: ${breaking.length}
- Warnings: ${warnings.length}

${breaking.length > 0 ? `
Breaking Changes:
${breaking.map((c, i) => `${i + 1}. ${c.description} (${c.field || 'root'})`).join('\n')}
` : ''}

${warnings.length > 0 ? `
Warnings:
${warnings.map((c, i) => `${i + 1}. ${c.description} (${c.field || 'root'})`).join('\n')}
` : ''}

${this.currentTest.analysis.migrationPath.length > 0 ? `
Migration Path:
${this.currentTest.analysis.migrationPath.map((step, i) => `${i + 1}. ${step.action}: ${step.description}`).join('\n')}
` : ''}
`;
      filename = `compatibility-report-${timestamp.split('T')[0]}.txt`;
      mimeType = 'text/plain';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    
    window.URL.revokeObjectURL(url);
  }

  shareResults(): void {
    // Implementation for sharing results (could be a URL with encoded test data)
    const testData = {
      name: this.currentTest?.name,
      mode: this.currentTest?.compatibilityMode,
      compatible: this.currentTest?.analysis?.isBackwardCompatible,
      changes: this.currentTest?.analysis?.changes.length
    };
    
    const encoded = btoa(JSON.stringify(testData));
    const url = `${window.location.origin}${window.location.pathname}?test=${encoded}`;
    
    navigator.clipboard.writeText(url).then(() => {
      alert('Test results link copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy link to clipboard');
    });
  }

  // History methods
  private loadTestHistory(): void {
    const stored = localStorage.getItem('compatibility-test-history');
    if (stored) {
      try {
        this.testHistory = JSON.parse(stored).map((test: any) => ({
          ...test,
          createdAt: new Date(test.createdAt)
        }));
        this.filteredHistory = [...this.testHistory];
      } catch (error) {
        console.error('Error loading test history:', error);
        this.testHistory = [];
      }
    }
  }

  private addToHistory(test: CompatibilityTest): void {
    this.testHistory.unshift(test);
    
    // Keep only last 50 tests
    if (this.testHistory.length > 50) {
      this.testHistory = this.testHistory.slice(0, 50);
    }

    this.saveTestHistory();
    this.filterHistory();
  }

  private saveTestHistory(): void {
    try {
      localStorage.setItem('compatibility-test-history', JSON.stringify(this.testHistory));
    } catch (error) {
      console.error('Error saving test history:', error);
    }
  }

  filterHistory(): void {
    const term = this.historySearchTerm.toLowerCase();
    this.filteredHistory = this.testHistory.filter(test =>
      test.name.toLowerCase().includes(term) ||
      (test.description && test.description.toLowerCase().includes(term)) ||
      (test.subjectName && test.subjectName.toLowerCase().includes(term))
    );
  }

  loadTest(test: CompatibilityTest): void {
    this.currentTest = test;
    this.filteredResults = test.analysis?.changes || [];
    this.resultsFilter = '';
  }

  clearHistory(): void {
    if (confirm('Are you sure you want to clear all test history?')) {
      this.testHistory = [];
      this.filteredHistory = [];
      localStorage.removeItem('compatibility-test-history');
    }
  }

  trackByChange(index: number, change: SchemaChange): string {
    return `${change.type}-${change.field}-${index}`;
  }

  trackByTest(index: number, test: CompatibilityTest): string {
    return test.id;
  }

  private generateTestId(): string {
    return `test-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }
}