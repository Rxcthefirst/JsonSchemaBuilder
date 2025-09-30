import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JsonSchema } from '../../models/schema.models';
import { MonacoEditorComponent } from '../monaco-editor/monaco-editor.component';
import { SampleDataGeneratorService, SampleGenerationOptions, SampleDataGenerationResult } from '../../services/sample-data-generator.service';

@Component({
  selector: 'app-schema-preview',
  imports: [CommonModule, FormsModule, MonacoEditorComponent],
  templateUrl: './schema-preview.component.html',
  styleUrl: './schema-preview.component.scss'
})
export class SchemaPreviewComponent implements OnChanges {
  @Input() schema: JsonSchema | null = null;
  @Input() enableInteractiveMode = false; // New input for power users
  @Output() schemaChange = new EventEmitter<JsonSchema>(); // New output for two-way binding
  
  formattedJson = '';
  showRawJson = true;
  isInteractiveMode = false;
  showSampleMode = false;
  
  // Sample generation state
  sampleResults: SampleDataGenerationResult[] = [];
  currentSampleIndex = 0;
  generatingSamples = false;
  sampleOptions: SampleGenerationOptions = {
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
    locale: 'en'
  };
  monacoOptions = {
    language: 'json',
    theme: 'vs' as const,
    fontSize: 13,
    readOnly: false,
    minimap: { enabled: false },
    wordWrap: 'on' as const,
    automaticLayout: true,
    formatOnPaste: true,
    formatOnType: true
  };

  constructor(private sampleGenerator: SampleDataGeneratorService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['schema'] && this.schema) {
      this.updateFormattedJson();
    }
    if (changes['enableInteractiveMode']) {
      this.isInteractiveMode = this.enableInteractiveMode;
    }
  }

  private updateFormattedJson(): void {
    if (this.schema) {
      try {
        this.formattedJson = JSON.stringify(this.schema, null, 2);
      } catch (error) {
        this.formattedJson = 'Error formatting JSON schema';
      }
    } else {
      this.formattedJson = '';
    }
  }

  // Monaco Editor event handlers
  onMonacoValueChange(value: string): void {
    try {
      const parsedSchema = JSON.parse(value);
      this.schemaChange.emit(parsedSchema);
    } catch (error) {
      // Don't emit invalid schemas, let Monaco show the error
      console.warn('Invalid JSON in Monaco editor:', error);
    }
  }

  onMonacoReady(editor: any): void {
    console.log('Monaco editor ready:', editor);
    // Could add additional setup here
  }

  onValidationChange(errors: any[]): void {
    // Handle validation errors if needed
    if (errors.length > 0) {
      console.warn('Monaco validation errors:', errors);
    }
  }

  // UI controls
  toggleInteractiveMode(): void {
    this.isInteractiveMode = !this.isInteractiveMode;
  }

  toggleView(): void {
    this.showRawJson = !this.showRawJson;
  }

  toggleSampleMode(): void {
    this.showSampleMode = !this.showSampleMode;
    if (this.showSampleMode && this.sampleResults.length === 0) {
      this.generateSamples();
    }
  }

  // Sample generation methods
  generateSamples(count: number = 3): void {
    if (!this.schema) {
      return;
    }

    this.generatingSamples = true;
    
    try {
      this.sampleResults = this.sampleGenerator.generateMultipleSamples(
        this.schema,
        count,
        this.sampleOptions
      );
      this.currentSampleIndex = 0;
    } catch (error) {
      console.error('Sample generation failed:', error);
      this.sampleResults = [];
    } finally {
      this.generatingSamples = false;
    }
  }

  generateSingleSample(): void {
    if (!this.schema) {
      return;
    }

    this.generatingSamples = true;
    
    try {
      const result = this.sampleGenerator.generateSampleData(this.schema, this.sampleOptions);
      this.sampleResults = [result];
      this.currentSampleIndex = 0;
    } catch (error) {
      console.error('Sample generation failed:', error);
      this.sampleResults = [];
    } finally {
      this.generatingSamples = false;
    }
  }

  nextSample(): void {
    if (this.currentSampleIndex < this.sampleResults.length - 1) {
      this.currentSampleIndex++;
    }
  }

  prevSample(): void {
    if (this.currentSampleIndex > 0) {
      this.currentSampleIndex--;
    }
  }

  getCurrentSample(): SampleDataGenerationResult | null {
    return this.sampleResults[this.currentSampleIndex] || null;
  }

  getCurrentSampleJson(): string {
    const current = this.getCurrentSample();
    return current ? JSON.stringify(current.sample, null, 2) : '';
  }

  copySampleToClipboard(): void {
    const sampleJson = this.getCurrentSampleJson();
    if (sampleJson) {
      navigator.clipboard.writeText(sampleJson).then(() => {
        console.log('Sample JSON copied to clipboard');
        // Could show a toast notification here
      }).catch(err => {
        console.error('Failed to copy sample to clipboard:', err);
      });
    }
  }

  downloadSample(): void {
    const current = this.getCurrentSample();
    if (!current) {
      return;
    }

    const sampleJson = JSON.stringify(current.sample, null, 2);
    const blob = new Blob([sampleJson], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const schemaTitle = this.schema?.title?.toLowerCase().replace(/\\s+/g, '-') || 'schema';
    link.download = `${schemaTitle}-sample-${this.currentSampleIndex + 1}.json`;
    link.click();
    window.URL.revokeObjectURL(url);
  }

  updateSampleOptions(): void {
    // Regenerate samples when options change
    if (this.sampleResults.length > 0) {
      this.generateSamples(this.sampleResults.length);
    }
  }

  copyToClipboard(): void {
    if (this.formattedJson) {
      navigator.clipboard.writeText(this.formattedJson).then(() => {
        // Could show a toast notification here
        console.log('Schema copied to clipboard');
      }).catch(err => {
        console.error('Failed to copy to clipboard:', err);
      });
    }
  }

  downloadSchema(): void {
    if (this.schema) {
      const blob = new Blob([this.formattedJson], { type: 'application/json' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${this.schema.title?.toLowerCase().replace(/\s+/g, '-') || 'schema'}.json`;
      link.click();
      window.URL.revokeObjectURL(url);
    }
  }

  getSchemaStats(): { properties: number; required: number; types: string[] } {
    if (!this.schema) {
      return { properties: 0, required: 0, types: [] };
    }

    const properties = Object.keys(this.schema.properties || {}).length;
    const required = (this.schema.required || []).length;
    const types = new Set<string>();
    
    if (this.schema.properties) {
      Object.values(this.schema.properties).forEach(prop => {
        types.add(prop.type);
      });
    }

    return {
      properties,
      required,
      types: Array.from(types)
    };
  }

  getPropertiesArray(): Array<{ name: string; type: string; required: boolean; description?: string }> {
    if (!this.schema || !this.schema.properties) {
      return [];
    }

    const required = this.schema.required || [];
    return Object.entries(this.schema.properties).map(([name, prop]) => ({
      name,
      type: prop.type,
      required: required.includes(name),
      description: prop.description
    }));
  }

  hasProperties(): boolean {
    return Boolean(this.schema?.properties && Object.keys(this.schema.properties).length > 0);
  }
}
