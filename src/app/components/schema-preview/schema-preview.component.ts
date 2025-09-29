import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { JsonSchema } from '../../models/schema.models';
import { MonacoEditorComponent } from '../monaco-editor/monaco-editor.component';

@Component({
  selector: 'app-schema-preview',
  imports: [CommonModule, MonacoEditorComponent],
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
