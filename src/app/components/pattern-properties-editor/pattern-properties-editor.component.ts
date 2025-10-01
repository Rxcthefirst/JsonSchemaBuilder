import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SchemaProperty, PropertyType } from '../../models/schema.models';

interface PatternProperty {
  id: string;
  pattern: string;
  description: string;
  schema: SchemaProperty;
  isValid: boolean;
  errorMessage?: string;
  examples: string[];
}

@Component({
  selector: 'app-pattern-properties-editor',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './pattern-properties-editor.component.html',
  styleUrl: './pattern-properties-editor.component.scss'
})
export class PatternPropertiesEditorComponent implements OnInit, OnChanges {
  @Input() patternProperties: { [pattern: string]: SchemaProperty } = {};
  @Input() currentDraft: string = 'draft-2020-12';
  @Output() patternPropertiesChange = new EventEmitter<{ [pattern: string]: SchemaProperty }>();

  PropertyType = PropertyType; // Make PropertyType available in template
  patterns: PatternProperty[] = [];
  showAddPattern = false;
  editingPatternId: string | null = null;
  
  newPatternRegex = '';
  newPatternDescription = '';
  testString = '';

  // Common regex patterns for quick selection
  readonly commonPatterns = [
    { name: 'Email-like keys', pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$', description: 'Email address format' },
    { name: 'Alphanumeric', pattern: '^[a-zA-Z0-9]+$', description: 'Letters and numbers only' },
    { name: 'Camel Case', pattern: '^[a-z][a-zA-Z0-9]*$', description: 'Camel case identifiers' },
    { name: 'Snake Case', pattern: '^[a-z][a-z0-9_]*$', description: 'Snake case identifiers' },
    { name: 'Kebab Case', pattern: '^[a-z][a-z0-9\\-]*$', description: 'Kebab case identifiers' },
    { name: 'UUID', pattern: '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$', description: 'UUID format' },
    { name: 'Date YYYY-MM-DD', pattern: '^\\d{4}-\\d{2}-\\d{2}$', description: 'Date in YYYY-MM-DD format' },
    { name: 'Prefixed keys', pattern: '^prefix_.*$', description: 'Keys starting with "prefix_"' },
    { name: 'Numeric keys', pattern: '^\\d+$', description: 'Numeric keys only' }
  ];

  ngOnInit() {
    this.initializePatterns();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['patternProperties']) {
      this.initializePatterns();
    }
  }

  private initializePatterns() {
    this.patterns = Object.keys(this.patternProperties).map(pattern => {
      const schema = this.patternProperties[pattern];
      return {
        id: this.generateId(),
        pattern,
        description: schema.description || '',
        schema: { ...schema },
        isValid: true,
        examples: this.generateExamples(pattern)
      };
    });
  }

  addPattern() {
    if (!this.newPatternRegex.trim()) return;

    const validation = this.validatePattern(this.newPatternRegex);
    if (!validation.isValid) {
      return; // Don't add invalid patterns
    }

    const newPattern: PatternProperty = {
      id: this.generateId(),
      pattern: this.newPatternRegex.trim(),
      description: this.newPatternDescription.trim(),
      schema: {
        id: this.generateId(),
        name: 'pattern_property',
        type: PropertyType.STRING,
        title: 'Pattern Property',
        description: this.newPatternDescription.trim(),
        required: false,
        validationRules: []
      },
      isValid: true,
      examples: this.generateExamples(this.newPatternRegex.trim())
    };

    this.patterns.push(newPattern);
    this.resetNewPatternForm();
    this.emitChanges();
  }

  removePattern(patternId: string) {
    const index = this.patterns.findIndex(p => p.id === patternId);
    if (index !== -1) {
      this.patterns.splice(index, 1);
      this.emitChanges();
    }
  }

  updatePattern(patternId: string, newPattern: string) {
    const pattern = this.patterns.find(p => p.id === patternId);
    if (!pattern) return;

    const validation = this.validatePattern(newPattern);
    pattern.pattern = newPattern;
    pattern.isValid = validation.isValid;
    pattern.errorMessage = validation.errorMessage;
    pattern.examples = validation.isValid ? this.generateExamples(newPattern) : [];
    
    this.emitChanges();
  }

  updatePatternDescription(patternId: string, newDescription: string) {
    const pattern = this.patterns.find(p => p.id === patternId);
    if (pattern) {
      pattern.description = newDescription;
      pattern.schema.description = newDescription;
      this.emitChanges();
    }
  }

  onPatternSchemaChange(patternId: string, updatedSchema: SchemaProperty) {
    const pattern = this.patterns.find(p => p.id === patternId);
    if (pattern) {
      pattern.schema = { ...updatedSchema };
      this.emitChanges();
    }
  }

  private validatePattern(patternString: string): { isValid: boolean; errorMessage?: string } {
    try {
      new RegExp(patternString);
      
      // Additional validation rules
      if (patternString.length === 0) {
        return { isValid: false, errorMessage: 'Pattern cannot be empty' };
      }
      
      if (patternString === '.*') {
        return { isValid: false, errorMessage: 'Pattern .* matches everything, use additionalProperties instead' };
      }
      
      return { isValid: true };
    } catch (error) {
      return { 
        isValid: false, 
        errorMessage: `Invalid regex: ${error instanceof Error ? error.message : 'Unknown error'}` 
      };
    }
  }

  private generateExamples(pattern: string): string[] {
    try {
      const regex = new RegExp(pattern);
      const examples: string[] = [];
      
      // Generate some basic examples based on common patterns
      const testCases = [
        'test', 'example', 'key1', 'key_2', 'key-3', 'keyValue', 'TestCase',
        'user@example.com', '12345', 'abc123', 'test_value', 'my-key',
        '2023-12-25', 'prefix_example', 'camelCaseKey', 'snake_case_key'
      ];
      
      testCases.forEach(testCase => {
        if (regex.test(testCase) && examples.length < 3) {
          examples.push(testCase);
        }
      });
      
      // If no examples found from test cases, try to generate simple ones
      if (examples.length === 0) {
        if (pattern.includes('[a-z]')) examples.push('example');
        if (pattern.includes('[A-Z]')) examples.push('Example');
        if (pattern.includes('\\d')) examples.push('123');
        if (examples.length === 0) examples.push('(pattern dependent)');
      }
      
      return examples;
    } catch {
      return [];
    }
  }

  testPatternMatch(pattern: string, testValue: string): boolean {
    try {
      return new RegExp(pattern).test(testValue);
    } catch {
      return false;
    }
  }

  private emitChanges() {
    const patternProperties: { [pattern: string]: SchemaProperty } = {};
    
    this.patterns.forEach(pattern => {
      if (pattern.isValid) {
        patternProperties[pattern.pattern] = pattern.schema;
      }
    });

    this.patternPropertiesChange.emit(patternProperties);
  }

  useCommonPattern(commonPattern: any) {
    this.newPatternRegex = commonPattern.pattern;
    this.newPatternDescription = commonPattern.description;
  }

  private resetNewPatternForm() {
    this.newPatternRegex = '';
    this.newPatternDescription = '';
    this.showAddPattern = false;
  }

  toggleAddPattern() {
    this.showAddPattern = !this.showAddPattern;
    if (!this.showAddPattern) {
      this.resetNewPatternForm();
    }
  }

  startEditingPattern(patternId: string) {
    this.editingPatternId = patternId;
  }

  stopEditingPattern() {
    this.editingPatternId = null;
  }

  private generateId(): string {
    return 'pattern_' + Math.random().toString(36).substr(2, 9);
  }

  getPatternValidation(pattern: string) {
    return this.validatePattern(pattern);
  }

  // Helper for template
  get newPatternValidation() {
    return this.validatePattern(this.newPatternRegex);
  }
}