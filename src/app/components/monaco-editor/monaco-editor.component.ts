import { Component, ElementRef, Input, Output, EventEmitter, ViewChild, OnInit, OnDestroy, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

declare var monaco: any;

export interface MonacoEditorOptions {
  theme?: 'vs' | 'vs-dark' | 'hc-black';
  language?: string;
  fontSize?: number;
  readOnly?: boolean;
  minimap?: { enabled: boolean };
  wordWrap?: 'off' | 'on' | 'wordWrapColumn' | 'bounded';
  automaticLayout?: boolean;
  formatOnPaste?: boolean;
  formatOnType?: boolean;
}

@Component({
  selector: 'app-monaco-editor',
  imports: [CommonModule],
  template: `
    <div class="monaco-editor-container">
      <div class="monaco-toolbar" *ngIf="showToolbar">
        <div class="editor-actions">
          <button 
            type="button" 
            class="btn btn-sm btn-outline" 
            (click)="formatDocument()"
            title="Format Document (Alt+Shift+F)">
            🎨 Format
          </button>
          <button 
            type="button" 
            class="btn btn-sm btn-outline" 
            (click)="validateJson()"
            title="Validate JSON (F8)">
            ✓ Validate
          </button>
          <button 
            type="button" 
            class="btn btn-sm btn-outline" 
            (click)="insertSchemaTemplate()"
            title="Insert Schema Template (Ctrl+Shift+P)">
            📋 Template
          </button>
          <button 
            type="button" 
            class="btn btn-sm btn-outline" 
            (click)="convertToReferences()"
            title="Convert to $ref Pattern">
            🔗 $ref
          </button>
          <button 
            type="button" 
            class="btn btn-sm btn-outline" 
            (click)="showSchemaStats()"
            title="Show Schema Statistics">
            📊 Stats
          </button>
          <button 
            type="button" 
            class="btn btn-sm btn-outline" 
            (click)="toggleTheme()"
            title="Toggle Theme">
            {{ isDarkTheme ? '☀️' : '🌙' }} Theme
          </button>
          <button 
            type="button" 
            class="btn btn-sm btn-outline" 
            (click)="toggleReadOnly()"
            title="Toggle Read-Only">
            {{ options.readOnly ? '✏️ Edit' : '👁️ View' }}
          </button>
        </div>
        
        <div class="editor-status">
          <span class="status-item" *ngIf="validationErrors.length > 0">
            ⚠️ {{ validationErrors.length }} issue(s)
          </span>
          <span class="status-item">
            Line {{ cursorPosition.line }}, Col {{ cursorPosition.column }}
          </span>
          <span class="status-item">
            {{ contentLength }} chars
          </span>
        </div>
      </div>
      
      <div #editorContainer class="monaco-editor-wrapper"></div>
      
      <div class="monaco-status-bar" *ngIf="validationErrors.length > 0">
        <div class="validation-errors">
          <div class="error-item" *ngFor="let error of validationErrors.slice(0, 3)">
            <span class="error-icon">
              {{ error.severity === 'error' ? '❌' : error.severity === 'warning' ? '⚠️' : 'ℹ️' }}
            </span>
            <span class="error-message">
              Line {{ error.line }}: {{ error.message }}
              <small *ngIf="error.suggestion" class="error-suggestion">
                💡 {{ error.suggestion }}
              </small>
            </span>
          </div>
          <div *ngIf="validationErrors.length > 3" class="more-errors">
            ... and {{ validationErrors.length - 3 }} more issue(s)
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrls: ['./monaco-editor.component.scss']
})
export class MonacoEditorComponent implements OnInit, OnDestroy, OnChanges {
  @ViewChild('editorContainer', { static: true }) editorContainer!: ElementRef;
  
  @Input() value: string = '';
  @Input() options: MonacoEditorOptions = {
    theme: 'vs',
    language: 'json',
    fontSize: 14,
    readOnly: false,
    minimap: { enabled: false },
    wordWrap: 'on',
    automaticLayout: true,
    formatOnPaste: true,
    formatOnType: true
  };
  @Input() showToolbar: boolean = true;
  @Input() height: string = '400px';
  @Input() jsonSchema?: any; // JSON Schema for validation
  
  @Output() valueChange = new EventEmitter<string>();
  @Output() editorReady = new EventEmitter<any>();
  @Output() validationChange = new EventEmitter<any[]>();
  
  private editor: any;
  private monacoLoaded = false;
  private completionProvider: any;
  private hoverProvider: any;
  private validationInterval: any;
  
  isDarkTheme = false;
  validationErrors: any[] = [];
  cursorPosition = { line: 1, column: 1 };
  contentLength = 0;
  
  // Advanced features
  private jsonSchemaSnippets = [
    {
      label: 'string-property',
      insertText: '"${1:propertyName}": {\n  "type": "string",\n  "description": "${2:Description}",\n  "minLength": ${3:1},\n  "maxLength": ${4:100}\n}',
      documentation: 'Creates a string property with validation rules'
    },
    {
      label: 'object-property', 
      insertText: '"${1:propertyName}": {\n  "type": "object",\n  "description": "${2:Description}",\n  "properties": {\n    ${3:}\n  },\n  "required": [${4:}],\n  "additionalProperties": ${5:false}\n}',
      documentation: 'Creates an object property with nested structure'
    },
    {
      label: 'array-property',
      insertText: '"${1:propertyName}": {\n  "type": "array",\n  "description": "${2:Description}",\n  "items": {\n    "type": "${3:string}"\n  },\n  "minItems": ${4:0},\n  "maxItems": ${5:100}\n}',
      documentation: 'Creates an array property with item validation'
    },
    {
      label: 'enum-property',
      insertText: '"${1:propertyName}": {\n  "type": "string",\n  "description": "${2:Description}",\n  "enum": [\n    "${3:option1}",\n    "${4:option2}",\n    "${5:option3}"\n  ]\n}',
      documentation: 'Creates an enumerated string property'
    },
    {
      label: 'ref-property',
      insertText: '"${1:propertyName}": {\n  "$ref": "#/definitions/${2:DefinitionName}"\n}',
      documentation: 'Creates a reference to a definition'
    },
    {
      label: 'conditional-schema',
      insertText: '{\n  "if": {\n    "properties": {\n      "${1:conditionProperty}": {\n        "const": "${2:value}"\n      }\n    }\n  },\n  "then": {\n    "properties": {\n      "${3:thenProperty}": {\n        "type": "${4:string}"\n      }\n    },\n    "required": ["${5:thenProperty}"]\n  },\n  "else": {\n    "properties": {\n      "${6:elseProperty}": {\n        "type": "${7:string}"\n      }\n    }\n  }\n}',
      documentation: 'Creates conditional schema validation'
    }
  ];

  ngOnInit(): void {
    this.loadMonaco();
  }

  ngOnDestroy(): void {
    if (this.editor) {
      this.editor.dispose();
    }
    
    // Clean up providers
    if (this.completionProvider) {
      this.completionProvider.dispose();
    }
    
    if (this.hoverProvider) {
      this.hoverProvider.dispose();
    }
    
    // Clean up validation interval
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
    }
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && this.editor && this.value !== this.editor.getValue()) {
      this.editor.setValue(this.value);
    }
    
    if (changes['jsonSchema'] && this.editor && this.jsonSchema) {
      this.setupJsonSchemaValidation();
    }
  }

  private loadMonaco(): void {
    // Check if Monaco is already loaded
    if (typeof monaco !== 'undefined') {
      this.monacoLoaded = true;
      this.initEditor();
      return;
    }

    // Load Monaco from CDN
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs/loader.min.js';
    script.onload = () => {
      (window as any).require.config({ 
        paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } 
      });
      
      (window as any).require(['vs/editor/editor.main'], () => {
        this.monacoLoaded = true;
        this.initEditor();
      });
    };
    
    document.body.appendChild(script);
  }

  private initEditor(): void {
    if (!this.monacoLoaded || !this.editorContainer?.nativeElement) {
      return;
    }

    // Configure JSON Schema validation if provided
    if (this.jsonSchema) {
      this.setupJsonSchemaValidation();
    }
    
    // Register JSON Schema language features
    this.registerJsonSchemaFeatures();

    // Create editor
    this.editor = monaco.editor.create(this.editorContainer.nativeElement, {
      value: this.value,
      language: this.options.language || 'json',
      theme: this.options.theme || 'vs',
      fontSize: this.options.fontSize || 14,
      readOnly: this.options.readOnly || false,
      minimap: this.options.minimap || { enabled: false },
      wordWrap: this.options.wordWrap || 'on',
      automaticLayout: this.options.automaticLayout !== false,
      formatOnPaste: this.options.formatOnPaste !== false,
      formatOnType: this.options.formatOnType !== false,
      scrollBeyondLastLine: false,
      renderWhitespace: 'selection',
      smoothScrolling: true,
      cursorBlinking: 'smooth',
      cursorSmoothCaretAnimation: 'on',
      contextmenu: true,
      mouseWheelZoom: true,
      multiCursorModifier: 'ctrlCmd',
      accessibilitySupport: 'auto',
      // Advanced features
      suggest: {
        showKeywords: true,
        showSnippets: true,
        showFunctions: true,
        showConstructors: true,
        showFields: true,
        showVariables: true,
        showClasses: true,
        showStructs: true,
        showInterfaces: true,
        showModules: true,
        showProperties: true,
        showEvents: true,
        showOperators: true,
        showUnits: true,
        showValues: true,
        showConstants: true,
        showEnums: true,
        showEnumMembers: true,
        showColors: true,
        showFiles: true,
        showReferences: true,
        showFolders: true,
        showTypeParameters: true
      },
      quickSuggestions: {
        other: true,
        comments: false,
        strings: true
      },
      parameterHints: {
        enabled: true
      },
      autoIndent: 'full',
      bracketPairColorization: {
        enabled: true
      },
      guides: {
        bracketPairs: true,
        indentation: true
      }
    });

    // Set up event listeners
    this.setupEventListeners();
    
    // Set height
    this.editorContainer.nativeElement.style.height = this.height;
    
    // Initial validation
    this.validateContent();
    this.updateStatus();
    
    // Start continuous validation
    this.startContinuousValidation();
    
    this.editorReady.emit(this.editor);
  }

  private setupEventListeners(): void {
    // Content change
    this.editor.onDidChangeModelContent(() => {
      const value = this.editor.getValue();
      this.valueChange.emit(value);
      this.validateContent();
      this.updateStatus();
    });

    // Cursor position change
    this.editor.onDidChangeCursorPosition((e: any) => {
      this.cursorPosition = {
        line: e.position.lineNumber,
        column: e.position.column
      };
    });

    // Add keyboard shortcuts
    this.addKeyboardShortcuts();
  }

  private addKeyboardShortcuts(): void {
    // Format document (Alt+Shift+F)
    this.editor.addCommand(monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.KeyF, () => {
      this.formatDocument();
    });

    // Validate (F8)  
    this.editor.addCommand(monaco.KeyCode.F8, () => {
      this.validateJson();
    });

    // Toggle theme (Ctrl+K, Ctrl+T)
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      // First part of chord - do nothing, wait for second key
    });
    
    // Advanced shortcuts
    // Collapse all (Ctrl+K, Ctrl+0)
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK, () => {
      this.editor.getAction('editor.foldAll').run();
    });
    
    // Expand all (Ctrl+K, Ctrl+J)
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyJ, () => {
      this.editor.getAction('editor.unfoldAll').run();
    });
    
    // Go to line (Ctrl+G)
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyG, () => {
      this.editor.getAction('editor.action.gotoLine').run();
    });
    
    // Quick fix (Ctrl+.)
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Period, () => {
      this.editor.getAction('editor.action.quickFix').run();
    });
    
    // Insert JSON Schema snippet (Ctrl+Shift+P)
    this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => {
      this.insertSchemaTemplate();
    });
  }

  private setupJsonSchemaValidation(): void {
    if (!monaco || !this.jsonSchema) {
      return;
    }

    // Configure JSON language service
    monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
      validate: true,
      allowComments: false,
      schemas: [{
        uri: 'http://json-schema.org/draft-07/schema#',
        fileMatch: ['*'],
        schema: this.jsonSchema
      }],
      enableSchemaRequest: true
    });
  }

  private registerJsonSchemaFeatures(): void {
    if (!monaco) return;

    // Register completion provider for JSON Schema snippets
    this.completionProvider = monaco.languages.registerCompletionItemProvider('json', {
      provideCompletionItems: (model: any, position: any) => {
        const suggestions = this.jsonSchemaSnippets.map(snippet => ({
          label: snippet.label,
          kind: monaco.languages.CompletionItemKind.Snippet,
          insertText: snippet.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          documentation: {
            value: snippet.documentation,
            isTrusted: true
          },
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column,
            endColumn: position.column
          }
        }));

        // Add JSON Schema specific suggestions
        const jsonSchemaKeywords = [
          { label: 'type', insertText: '"type": "${1|string,number,boolean,object,array,null|}"' },
          { label: 'properties', insertText: '"properties": {\n  ${1}\n}' },
          { label: 'required', insertText: '"required": [${1}]' },
          { label: 'additionalProperties', insertText: '"additionalProperties": ${1|true,false|}' },
          { label: 'pattern', insertText: '"pattern": "${1:^[a-zA-Z0-9]+$}"' },
          { label: 'format', insertText: '"format": "${1|date-time,date,time,email,uri,uuid|}"' },
          { label: 'minimum', insertText: '"minimum": ${1:0}' },
          { label: 'maximum', insertText: '"maximum": ${1:100}' },
          { label: 'minLength', insertText: '"minLength": ${1:0}' },
          { label: 'maxLength', insertText: '"maxLength": ${1:100}' },
          { label: 'minItems', insertText: '"minItems": ${1:0}' },
          { label: 'maxItems', insertText: '"maxItems": ${1:100}' },
          { label: 'uniqueItems', insertText: '"uniqueItems": ${1|true,false|}' },
          { label: 'enum', insertText: '"enum": [${1}]' },
          { label: 'const', insertText: '"const": "${1:value}"' },
          { label: 'default', insertText: '"default": ${1}' },
          { label: 'examples', insertText: '"examples": [${1}]' },
          { label: '$ref', insertText: '"$ref": "${1:#/definitions/}"' },
          { label: 'definitions', insertText: '"definitions": {\n  ${1}\n}' },
          { label: 'if', insertText: '"if": {\n  ${1}\n}' },
          { label: 'then', insertText: '"then": {\n  ${1}\n}' },
          { label: 'else', insertText: '"else": {\n  ${1}\n}' },
          { label: 'allOf', insertText: '"allOf": [\n  ${1}\n]' },
          { label: 'anyOf', insertText: '"anyOf": [\n  ${1}\n]' },
          { label: 'oneOf', insertText: '"oneOf": [\n  ${1}\n]' },
          { label: 'not', insertText: '"not": {\n  ${1}\n}' }
        ].map(keyword => ({
          label: keyword.label,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: keyword.insertText,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range: {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: position.column,
            endColumn: position.column
          }
        }));

        return {
          suggestions: [...suggestions, ...jsonSchemaKeywords]
        };
      }
    });

    // Register hover provider for JSON Schema documentation
    this.hoverProvider = monaco.languages.registerHoverProvider('json', {
      provideHover: (model: any, position: any) => {
        const word = model.getWordAtPosition(position);
        if (!word) return null;

        const jsonSchemaHelp: { [key: string]: string } = {
          'type': 'Defines the data type of the property (string, number, boolean, object, array, null)',
          'properties': 'Defines the properties of an object type',
          'required': 'Array of property names that must be present',
          'additionalProperties': 'Whether additional properties are allowed in objects',
          'pattern': 'Regular expression that string values must match',
          'format': 'Semantic format for string validation (email, uri, date, etc.)',
          'minimum': 'Minimum value for numeric types',
          'maximum': 'Maximum value for numeric types',
          'minLength': 'Minimum length for string types',
          'maxLength': 'Maximum length for string types',
          'minItems': 'Minimum number of items in arrays',
          'maxItems': 'Maximum number of items in arrays',
          'uniqueItems': 'Whether array items must be unique',
          'enum': 'List of valid values',
          'const': 'Single valid value',
          'default': 'Default value for the property',
          'examples': 'Example values for documentation',
          '$ref': 'Reference to another schema or definition',
          'definitions': 'Reusable schema definitions',
          'if': 'Conditional schema validation',
          'then': 'Schema to apply when if condition is true',
          'else': 'Schema to apply when if condition is false',
          'allOf': 'Must validate against all schemas in the array',
          'anyOf': 'Must validate against any schema in the array',
          'oneOf': 'Must validate against exactly one schema in the array',
          'not': 'Must not validate against the given schema'
        };

        const help = jsonSchemaHelp[word.word];
        if (help) {
          return {
            range: new monaco.Range(
              position.lineNumber,
              word.startColumn,
              position.lineNumber,
              word.endColumn
            ),
            contents: [
              { value: `**${word.word}**` },
              { value: help }
            ]
          };
        }
        
        return null;
      }
    });
  }

  private startContinuousValidation(): void {
    // Clear any existing interval
    if (this.validationInterval) {
      clearInterval(this.validationInterval);
    }

    // Validate every 2 seconds during editing
    this.validationInterval = setInterval(() => {
      this.validateContent();
    }, 2000);
  }

  private validateContent(): void {
    const content = this.editor.getValue();
    this.contentLength = content.length;
    
    try {
      const parsed = JSON.parse(content);
      this.validationErrors = [];
      
      // Perform JSON Schema-specific validation
      this.validateJsonSchema(parsed, content);
      
    } catch (error: any) {
      const errorMessage = error.message || 'Invalid JSON';
      const lineMatch = errorMessage.match(/line (\d+)/);
      const line = lineMatch ? parseInt(lineMatch[1]) : this.getErrorLineFromContent(content, error);
      
      this.validationErrors = [{
        line,
        column: 1,
        message: this.getEnhancedErrorMessage(errorMessage),
        severity: 'error',
        suggestion: this.getSuggestionForError(errorMessage)
      }];
    }
    
    this.validationChange.emit(this.validationErrors);
  }

  private validateJsonSchema(parsed: any, content: string): void {
    if (!parsed || typeof parsed !== 'object') return;

    const warnings: any[] = [];
    
    // Check for common JSON Schema best practices
    if (!parsed.$schema) {
      warnings.push({
        line: 1,
        column: 1,
        message: 'Consider adding $schema property to specify JSON Schema version',
        severity: 'warning',
        suggestion: 'Add: "$schema": "http://json-schema.org/draft-07/schema#"'
      });
    }

    if (!parsed.type && !parsed.$ref) {
      warnings.push({
        line: 1,
        column: 1,
        message: 'Schema should specify a type or be a reference',
        severity: 'warning',
        suggestion: 'Add: "type": "object" (or appropriate type)'
      });
    }

    if (parsed.type === 'object' && !parsed.properties && !parsed.$ref) {
      warnings.push({
        line: this.findLineForProperty(content, 'type'),
        column: 1,
        message: 'Object type should define properties',
        severity: 'warning',
        suggestion: 'Add: "properties": { ... }'
      });
    }

    if (parsed.type === 'array' && !parsed.items) {
      warnings.push({
        line: this.findLineForProperty(content, 'type'),
        column: 1,
        message: 'Array type should define items schema',
        severity: 'warning',
        suggestion: 'Add: "items": { "type": "string" } (or appropriate type)'
      });
    }

    // Check for unused definitions
    if (parsed.definitions) {
      const definitionNames = Object.keys(parsed.definitions);
      const schemaString = JSON.stringify(parsed);
      
      definitionNames.forEach(defName => {
        const refPattern = `"$ref":\s*"#/definitions/${defName}"`;
        if (!new RegExp(refPattern).test(schemaString)) {
          warnings.push({
            line: this.findLineForProperty(content, `definitions.${defName}`),
            column: 1,
            message: `Definition '${defName}' is not referenced`,
            severity: 'info',
            suggestion: `Reference with: "$ref": "#/definitions/${defName}"`
          });
        }
      });
    }

    this.validationErrors.push(...warnings);
  }

  private getErrorLineFromContent(content: string, error: any): number {
    // Try to extract line number from error or find problematic area
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for common JSON syntax errors
      if (line.match(/[^\s]\s*[,}]/)) {
        return i + 1;
      }
    }
    return 1;
  }

  private getEnhancedErrorMessage(originalMessage: string): string {
    const errorMappings: { [key: string]: string } = {
      'Unexpected token': 'Syntax error: Check for missing commas, quotes, or brackets',
      'Unexpected end of JSON input': 'Incomplete JSON: Missing closing brackets or braces',
      'Expected property name': 'Missing property name: Properties must be quoted strings',
      'Duplicate keys': 'Duplicate property names are not allowed in JSON objects'
    };

    for (const [pattern, enhancement] of Object.entries(errorMappings)) {
      if (originalMessage.includes(pattern)) {
        return enhancement;
      }
    }
    
    return originalMessage;
  }

  private getSuggestionForError(errorMessage: string): string {
    if (errorMessage.includes('Unexpected token')) {
      return 'Check for trailing commas, missing quotes around property names, or mismatched brackets';
    }
    if (errorMessage.includes('Unexpected end')) {
      return 'Add missing closing brackets } or ] to complete the JSON structure';
    }
    return 'Review the JSON syntax and structure';
  }

  private findLineForProperty(content: string, propertyPath: string): number {
    const lines = content.split('\n');
    const propertyName = propertyPath.split('.').pop() || propertyPath;
    
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes(`"${propertyName}"`)) {
        return i + 1;
      }
    }
    
    return 1;
  }

  private updateStatus(): void {
    // Update content length and other status indicators
    this.contentLength = this.editor.getValue().length;
  }

  // Public utility methods
  insertSchemaTemplate(): void {
    if (!this.editor) return;

    const basicTemplate = {
      "$schema": "http://json-schema.org/draft-07/schema#",
      "type": "object",
      "title": "New Schema",
      "description": "A new JSON schema",
      "properties": {
        "example": {
          "type": "string",
          "description": "An example property"
        }
      },
      "required": ["example"],
      "additionalProperties": false
    };

    const formatted = JSON.stringify(basicTemplate, null, 2);
    this.editor.setValue(formatted);
  }

  convertToReferences(): void {
    if (!this.editor) return;

    try {
      const content = this.editor.getValue();
      const schema = JSON.parse(content);
      
      if (schema.type === 'object' && schema.properties) {
        const converted = this.convertObjectToReferences(schema);
        const formatted = JSON.stringify(converted, null, 2);
        this.editor.setValue(formatted);
        
        this.showNotification('✓ Converted to $ref pattern', 'success');
      } else {
        this.showNotification('⚠️ Schema must be an object with properties', 'warning');
      }
    } catch (error) {
      this.showNotification('❌ Invalid JSON schema', 'error');
    }
  }

  private convertObjectToReferences(schema: any): any {
    const definitions: any = {};
    const newProperties: any = {};
    
    // Extract complex properties to definitions
    Object.keys(schema.properties || {}).forEach(propName => {
      const prop = schema.properties[propName];
      
      if (prop.type === 'object' && prop.properties) {
        const defName = this.capitalizeFirst(propName) + 'Type';
        definitions[defName] = {
          type: 'object',
          properties: prop.properties,
          required: prop.required || [],
          additionalProperties: prop.additionalProperties !== undefined ? prop.additionalProperties : false
        };
        
        newProperties[propName] = {
          $ref: `#/definitions/${defName}`,
          description: prop.description
        };
      } else {
        newProperties[propName] = prop;
      }
    });

    return {
      ...schema,
      properties: newProperties,
      ...(Object.keys(definitions).length > 0 ? { definitions } : {})
    };
  }

  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  showSchemaStats(): void {
    if (!this.editor) return;

    try {
      const content = this.editor.getValue();
      const schema = JSON.parse(content);
      
      const stats = this.calculateSchemaStats(schema);
      const message = `📊 Schema Stats:\n• Properties: ${stats.properties}\n• Definitions: ${stats.definitions}\n• Max Depth: ${stats.maxDepth}\n• Types Used: ${stats.types.join(', ')}`;
      
      this.showNotification(message, 'info', 5000);
    } catch (error) {
      this.showNotification('❌ Invalid JSON for analysis', 'error');
    }
  }

  private calculateSchemaStats(schema: any, depth = 0): any {
    const stats = {
      properties: 0,
      definitions: 0,
      maxDepth: depth,
      types: new Set<string>()
    };

    if (schema.type) {
      stats.types.add(schema.type);
    }

    if (schema.properties) {
      stats.properties += Object.keys(schema.properties).length;
      
      Object.values(schema.properties).forEach((prop: any) => {
        const subStats = this.calculateSchemaStats(prop, depth + 1);
        stats.properties += subStats.properties;
        stats.maxDepth = Math.max(stats.maxDepth, subStats.maxDepth);
        subStats.types.forEach((type: string) => stats.types.add(type));
      });
    }

    if (schema.definitions) {
      stats.definitions = Object.keys(schema.definitions).length;
      
      Object.values(schema.definitions).forEach((def: any) => {
        const subStats = this.calculateSchemaStats(def, depth + 1);
        stats.properties += subStats.properties;
        stats.maxDepth = Math.max(stats.maxDepth, subStats.maxDepth);
        subStats.types.forEach((type: string) => stats.types.add(type));
      });
    }

    return {
      ...stats,
      types: Array.from(stats.types)
    };
  }

  private showNotification(message: string, type: 'success' | 'warning' | 'error' | 'info' = 'info', duration = 3000): void {
    const notification = document.createElement('div');
    notification.textContent = message;
    notification.style.cssText = `
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 12px 16px;
      border-radius: 6px;
      color: white;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      z-index: 1000;
      max-width: 300px;
      white-space: pre-line;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      animation: slideIn 0.3s ease-out;
      background: ${type === 'success' ? '#28a745' : type === 'warning' ? '#ffc107' : type === 'error' ? '#dc3545' : '#17a2b8'};
    `;
    
    this.editorContainer.nativeElement.style.position = 'relative';
    this.editorContainer.nativeElement.appendChild(notification);
    
    setTimeout(() => {
      if (notification.parentNode) {
        notification.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => {
          if (notification.parentNode) {
            notification.parentNode.removeChild(notification);
          }
        }, 300);
      }
    }, duration);
  }
  formatDocument(): void {
    if (!this.editor) return;
    
    try {
      const value = this.editor.getValue();
      const parsed = JSON.parse(value);
      const formatted = JSON.stringify(parsed, null, 2);
      this.editor.setValue(formatted);
      this.showNotification('✓ Document formatted', 'success', 2000);
    } catch (error) {
      this.showNotification('❌ Cannot format invalid JSON', 'error');
    }
  }

  validateJson(): void {
    this.validateContent();
    
    if (this.validationErrors.length === 0) {
      this.showNotification('✓ Valid JSON Schema', 'success', 2000);
    } else {
      const errorCount = this.validationErrors.filter(e => e.severity === 'error').length;
      const warningCount = this.validationErrors.filter(e => e.severity === 'warning').length;
      
      if (errorCount > 0) {
        this.showNotification(`❌ ${errorCount} error(s) found`, 'error');
      } else {
        this.showNotification(`⚠️ ${warningCount} warning(s) found`, 'warning');
      }
    }
  }

  toggleTheme(): void {
    this.isDarkTheme = !this.isDarkTheme;
    const theme = this.isDarkTheme ? 'vs-dark' : 'vs';
    monaco.editor.setTheme(theme);
    this.options.theme = theme;
  }

  toggleReadOnly(): void {
    if (!this.editor) return;
    
    this.options.readOnly = !this.options.readOnly;
    this.editor.updateOptions({ readOnly: this.options.readOnly });
  }

  setValue(value: string): void {
    if (this.editor && value !== this.editor.getValue()) {
      this.editor.setValue(value);
    }
  }

  getValue(): string {
    return this.editor ? this.editor.getValue() : this.value;
  }

  focus(): void {
    if (this.editor) {
      this.editor.focus();
    }
  }

  getEditor(): any {
    return this.editor;
  }
}