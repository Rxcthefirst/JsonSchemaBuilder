import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { debounceTime } from 'rxjs/operators';
import { 
  SchemaProperty, 
  PropertyType, 
  DEFAULT_STRING_FORMATS,
  CONTENT_ENCODINGS,
  CONTENT_MEDIA_TYPES,
  DRAFT_FEATURES,
  VALIDATION_RULE_TYPES 
} from '../../models/schema.models';
import { SchemaValidationService } from '../../services/schema-validation.service';
import { OneOfEditorComponent } from '../oneof-editor/oneof-editor.component';
import { DependencyEditorComponent } from '../dependency-editor/dependency-editor.component';
import { PatternPropertiesEditorComponent } from '../pattern-properties-editor/pattern-properties-editor.component';
import { AdvancedArrayEditorComponent } from '../advanced-array-editor/advanced-array-editor.component';
import { ReferenceManagerComponent } from '../reference-manager/reference-manager.component';

export interface PropertyTreeNode {
  property: SchemaProperty;
  isExpanded: boolean;
  canHaveChildren: boolean;
  children: PropertyTreeNode[];
  level: number;
  parent: PropertyTreeNode | null;
}

@Component({
  selector: 'app-property-tree-editor',
  imports: [CommonModule, FormsModule, ReactiveFormsModule, OneOfEditorComponent, DependencyEditorComponent, PatternPropertiesEditorComponent, AdvancedArrayEditorComponent, ReferenceManagerComponent],
  templateUrl: './property-tree-editor.component.html',
  styleUrl: './property-tree-editor.component.scss'
})
export class PropertyTreeEditorComponent implements OnInit, OnChanges {
  @Input() property!: SchemaProperty;
  @Input() level: number = 0;
  @Input() currentDraft: string = 'draft-07'; // Draft awareness
  @Input() rootDefinitions: { [key: string]: SchemaProperty } | null = null;
  @Input() rootSchemaProperty: SchemaProperty | null = null;
  @Output() propertyChange = new EventEmitter<SchemaProperty>();
  @Output() deleteProperty = new EventEmitter<void>();
  @Output() definitionsUpdate = new EventEmitter<{ [key: string]: SchemaProperty }>();
  @Output() propertyReferenceUpdate = new EventEmitter<{ property: SchemaProperty; ref: string }>();

  propertyForm!: FormGroup;
  propertyTypes = Object.values(PropertyType);
  PropertyType = PropertyType; // Make PropertyType available in template
  
  // Draft-aware format support
  stringFormats: string[] = [];
  contentEncodings = CONTENT_ENCODINGS;
  contentMediaTypes = CONTENT_MEDIA_TYPES;
  
  isExpanded = false;
  showAdvanced = false;
  showConditional = false;
  showComposition = false;
  private previousType: PropertyType | null = null;
  private isUpdatingForm = false;
  
  constructor(
    private fb: FormBuilder,
    private validationService: SchemaValidationService
  ) {}

  ngOnInit(): void {
    this.updateDraftFeatures();
    this.initializeForm();
    this.isExpanded = this.level < 2; // Auto-expand first two levels
  }

  private updateDraftFeatures(): void {
    // Update available formats based on current draft
    this.stringFormats = DEFAULT_STRING_FORMATS[this.currentDraft as keyof typeof DEFAULT_STRING_FORMATS] || DEFAULT_STRING_FORMATS['draft-07'];
    
    // Clean up unsupported properties for current draft
    this.cleanupUnsupportedProperties();
  }

  private cleanupUnsupportedProperties(): void {
    if (!this.property) return;

    const supported = this.supportedFeatures;
    const currentProperty = { ...this.property };
    
    // Remove properties not supported in current draft
    if (!supported.includes('const')) {
      delete (currentProperty as any).const;
    }
    if (!supported.includes('examples')) {
      delete (currentProperty as any).examples;
    }
    if (!supported.includes('contentEncoding')) {
      delete (currentProperty as any).contentEncoding;
    }
    if (!supported.includes('contentMediaType')) {
      delete (currentProperty as any).contentMediaType;
    }
    if (!supported.includes('comment')) {
      delete (currentProperty as any).comment;
    }
    if (!supported.includes('deprecated')) {
      delete (currentProperty as any).deprecated;
    }
    if (!supported.includes('readOnly')) {
      delete (currentProperty as any).readOnly;
    }
    if (!supported.includes('writeOnly')) {
      delete (currentProperty as any).writeOnly;
    }

    // Handle exclusive minimum/maximum type changes
    if (this.exclusiveMinimumType === 'boolean') {
      // Convert number to boolean or remove if not applicable
      if (typeof (currentProperty as any).exclusiveMinimum === 'number') {
        delete (currentProperty as any).exclusiveMinimum;
      }
      if (typeof (currentProperty as any).exclusiveMaximum === 'number') {
        delete (currentProperty as any).exclusiveMaximum;
      }
    } else {
      // Remove boolean exclusive properties
      delete (currentProperty as any).exclusiveMinimumBoolean;
      delete (currentProperty as any).exclusiveMaximumBoolean;
    }

    // Update the property if changes were made
    if (JSON.stringify(currentProperty) !== JSON.stringify(this.property)) {
      this.property = currentProperty;
      this.propertyChange.emit(this.property);
      this.updateFormFromProperty();
    }
  }

  get supportedFeatures(): string[] {
    return DRAFT_FEATURES[this.currentDraft as keyof typeof DRAFT_FEATURES]?.supports || DRAFT_FEATURES['draft-07'].supports;
  }

  get exclusiveMinimumType(): 'number' | 'boolean' {
    return DRAFT_FEATURES[this.currentDraft as keyof typeof DRAFT_FEATURES]?.exclusiveMinimum as 'number' | 'boolean' || 'number';
  }

  showAnnotations(): boolean {
    return this.supportedFeatures.some(feature => 
      ['comment', 'deprecated', 'readOnly', 'writeOnly'].includes(feature)
    );
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['property']) {
      if (this.propertyForm) {
        // Property has changed, update the form to reflect new values
        this.updateFormFromProperty();
      }
      // If form not initialized yet, it will be handled in ngOnInit with current property values
    }
  }

  private initializeForm(): void {
    this.propertyForm = this.fb.group({
      name: [this.property.name],
      type: [this.property.type],
      title: [this.property.title || ''],
      description: [this.property.description || ''],
      required: [this.property.required || false],
      
      // String constraints
      minLength: [this.property.minLength],
      maxLength: [this.property.maxLength],
      pattern: [this.property.pattern],
      format: [this.property.format],
      contentEncoding: [this.property.contentEncoding],
      contentMediaType: [this.property.contentMediaType],
      
      // Number/Integer constraints
      minimum: [this.property.minimum],
      maximum: [this.property.maximum],
      exclusiveMinimum: [this.property.exclusiveMinimum],
      exclusiveMaximum: [this.property.exclusiveMaximum],
      exclusiveMinimumBoolean: [typeof this.property.exclusiveMinimum === 'boolean' ? this.property.exclusiveMinimum : false],
      exclusiveMaximumBoolean: [typeof this.property.exclusiveMaximum === 'boolean' ? this.property.exclusiveMaximum : false],
      multipleOf: [this.property.multipleOf],
      
      // Array constraints  
      minItems: [this.property.minItems],
      maxItems: [this.property.maxItems],
      uniqueItems: [this.property.uniqueItems || false],
      additionalItems: [this.property.additionalItems !== false],
      
      // Object constraints
      minProperties: [this.property.minProperties],
      maxProperties: [this.property.maxProperties],
      additionalProperties: [this.property.additionalProperties !== false],
      propertyNamesPattern: [''], // Derived from propertyNames if exists
      
      // Values and examples
      enumValues: [this.property.enum ? this.property.enum.join(', ') : ''],
      constValue: [this.property.const],
      defaultValue: [this.property.defaultValue],
      examples: [this.property.examples ? this.property.examples.join(', ') : ''],
      
      // Annotations (Draft 7+)
      comment: [this.property.comment],
      deprecated: [this.property.deprecated || false],
      readOnly: [this.property.readOnly || false],
      writeOnly: [this.property.writeOnly || false],
      
      // Conditional validation (Draft 7+)
      ifCondition: [this.property.if ? JSON.stringify(this.property.if, null, 2) : ''],
      thenSchema: [this.property.then ? JSON.stringify(this.property.then, null, 2) : ''],
      elseSchema: [this.property.else ? JSON.stringify(this.property.else, null, 2) : ''],
      
      // Composition
      allOf: [this.property.allOf ? JSON.stringify(this.property.allOf, null, 2) : ''],
      anyOf: [this.property.anyOf ? JSON.stringify(this.property.anyOf, null, 2) : ''],
      oneOf: [this.property.oneOf ? JSON.stringify(this.property.oneOf, null, 2) : ''],
      not: [this.property.not ? JSON.stringify(this.property.not, null, 2) : '']
    });

    // Only subscribe to type changes for clearing old constraints
    this.propertyForm.get('type')?.valueChanges.subscribe((newType: PropertyType) => {
      if (this.previousType && this.previousType !== newType) {
        this.clearTypeSpecificProperties(this.previousType);
        
        // Only emit change on actual type change (important structural change)
        this.updateAndEmitProperty();
      }
      this.previousType = newType;
    });
    
    // Subscribe to form changes with debouncing for name field
    this.propertyForm.valueChanges.pipe(
      debounceTime(300) // Debounce for 300ms to prevent excessive updates during typing
    ).subscribe(() => {
      if (!this.isUpdatingForm) {
        this.updateProperty();
      }
    });
    
    // Set initial previous type
    this.previousType = this.property.type;
  }

  private updateFormFromProperty(): void {
    // Set flag to prevent infinite loops
    this.isUpdatingForm = true;
    
    // Update form controls to match the current property values
    this.propertyForm.patchValue({
      name: this.property.name,
      type: this.property.type,
      title: this.property.title || '',
      description: this.property.description || '',
      required: this.property.required || false,
      
      // String constraints
      minLength: this.property.minLength ?? '',
      maxLength: this.property.maxLength ?? '',
      pattern: this.property.pattern || '',
      format: this.property.format || '',
      
      // Number constraints
      minimum: this.property.minimum ?? '',
      maximum: this.property.maximum ?? '',
      exclusiveMinimum: this.property.exclusiveMinimum ?? '',
      exclusiveMaximum: this.property.exclusiveMaximum ?? '',
      exclusiveMinimumBoolean: typeof this.property.exclusiveMinimum === 'boolean' ? this.property.exclusiveMinimum : false,
      exclusiveMaximumBoolean: typeof this.property.exclusiveMaximum === 'boolean' ? this.property.exclusiveMaximum : false,
      multipleOf: this.property.multipleOf ?? '',
      
      // Array constraints
      minItems: this.property.minItems ?? '',
      maxItems: this.property.maxItems ?? '',
      uniqueItems: this.property.uniqueItems || false,
      
      // Object constraints
      minProperties: this.property.minProperties ?? '',
      maxProperties: this.property.maxProperties ?? '',
      additionalProperties: this.property.additionalProperties !== false,
      
      // Enum values
      enumValues: this.property.enum ? this.property.enum.join(', ') : ''
    }, { emitEvent: false }); // Don't emit events to avoid infinite loops
    
    // Update previous type to match current property
    this.previousType = this.property.type;
    
    // Reset the flag
    this.isUpdatingForm = false;
  }

  private updateProperty(): void {
    const formValue = this.propertyForm.value;
    
    const updatedProperty: SchemaProperty = {
      ...this.property,
      name: formValue.name || 'untitled', // Provide fallback for empty names
      type: formValue.type,
      title: formValue.title,
      description: formValue.description,
      required: formValue.required,
      
      // Add type-specific properties
      ...this.getTypeSpecificProperties(formValue)
    };

    this.property = updatedProperty;
    this.propertyChange.emit(this.property);
  }

  private updateAndEmitProperty(): void {
    // Only update and emit for significant changes like type changes
    this.updateProperty();
  }

  private clearTypeSpecificProperties(oldType: PropertyType): void {
    // Clear properties that don't apply to the new type
    const clearedProperties = this.getClearedProperty();
    Object.assign(this.property, clearedProperties);
    
    // Reset form controls for the old type
    this.resetFormControlsForType(oldType);
  }
  
  private resetFormControlsForType(oldType: PropertyType): void {
    // Always clear enum values when switching types
    this.propertyForm.get('enumValues')?.setValue('');
    
    switch (oldType) {
      case PropertyType.STRING:
        this.propertyForm.get('minLength')?.setValue('');
        this.propertyForm.get('maxLength')?.setValue('');
        this.propertyForm.get('pattern')?.setValue('');
        this.propertyForm.get('format')?.setValue('');
        break;
      case PropertyType.NUMBER:
      case PropertyType.INTEGER:
        this.propertyForm.get('minimum')?.setValue('');
        this.propertyForm.get('maximum')?.setValue('');
        this.propertyForm.get('multipleOf')?.setValue('');
        break;
      case PropertyType.ARRAY:
        this.propertyForm.get('minItems')?.setValue('');
        this.propertyForm.get('maxItems')?.setValue('');
        this.propertyForm.get('uniqueItems')?.setValue(false);
        break;
      case PropertyType.OBJECT:
        this.propertyForm.get('minProperties')?.setValue('');
        this.propertyForm.get('maxProperties')?.setValue('');
        this.propertyForm.get('additionalProperties')?.setValue(true);
        break;
    }
  }

  private getClearedProperty(): Partial<SchemaProperty> {
    return {
      // Clear ALL type-specific properties completely
      minLength: undefined,
      maxLength: undefined,
      pattern: undefined,
      format: undefined,
      minimum: undefined,
      maximum: undefined,
      multipleOf: undefined,
      exclusiveMinimum: undefined,
      exclusiveMaximum: undefined,
      minItems: undefined,
      maxItems: undefined,
      uniqueItems: undefined,
      minProperties: undefined,
      maxProperties: undefined,
      additionalProperties: undefined,
      enum: undefined, // Clear enum when switching types
      // IMPORTANT: Clear nested structures when switching away from object/array
      items: undefined,
      properties: undefined
    };
  }

  private getTypeSpecificProperties(formValue: any): Partial<SchemaProperty> {
    const type = formValue.type as PropertyType;
    const props: Partial<SchemaProperty> = {};

    // Handle enum values for all types
    if (formValue.enumValues && formValue.enumValues.trim()) {
      const enumArray = formValue.enumValues.split(',').map((val: string) => {
        const trimmed = val.trim();
        // Try to parse as appropriate type
        if (type === PropertyType.NUMBER || type === PropertyType.INTEGER) {
          const num = Number(trimmed);
          return isNaN(num) ? trimmed : num;
        } else if (type === PropertyType.BOOLEAN) {
          if (trimmed.toLowerCase() === 'true') return true;
          if (trimmed.toLowerCase() === 'false') return false;
          return trimmed;
        }
        return trimmed;
      }).filter((val: any) => val !== '');
      
      if (enumArray.length > 0) {
        props.enum = enumArray;
      }
    }

    // Handle const value (Draft 6+)
    if (this.supportedFeatures.includes('const') && formValue.constValue && formValue.constValue.trim()) {
      props.const = this.parseValueForType(formValue.constValue.trim(), type);
    }

    // Handle default value
    if (formValue.defaultValue && formValue.defaultValue.trim()) {
      props.defaultValue = this.parseValueForType(formValue.defaultValue.trim(), type);
    }

    // Handle examples (Draft 6+)
    if (this.supportedFeatures.includes('examples') && formValue.examples && formValue.examples.trim()) {
      const exampleArray = formValue.examples.split(',').map((val: string) => 
        this.parseValueForType(val.trim(), type)
      ).filter((val: any) => val !== '');
      
      if (exampleArray.length > 0) {
        props.examples = exampleArray;
      }
    }

    // Handle annotations (Draft 7+)
    if (this.supportedFeatures.includes('comment') && formValue.comment && formValue.comment.trim()) {
      props.comment = formValue.comment.trim();
    }
    if (this.supportedFeatures.includes('deprecated')) {
      props.deprecated = formValue.deprecated;
    }
    if (this.supportedFeatures.includes('readOnly')) {
      props.readOnly = formValue.readOnly;
    }
    if (this.supportedFeatures.includes('writeOnly')) {
      props.writeOnly = formValue.writeOnly;
    }

    // Handle conditional validation (Draft 7+)
    if (this.supportedFeatures.includes('if')) {
      if (formValue.ifCondition && formValue.ifCondition.trim()) {
        try {
          props.if = JSON.parse(formValue.ifCondition.trim());
        } catch (e) {
          console.warn('Invalid if condition JSON:', e);
        }
      }
      if (formValue.thenSchema && formValue.thenSchema.trim()) {
        try {
          props.then = JSON.parse(formValue.thenSchema.trim());
        } catch (e) {
          console.warn('Invalid then schema JSON:', e);
        }
      }
      if (formValue.elseSchema && formValue.elseSchema.trim()) {
        try {
          props.else = JSON.parse(formValue.elseSchema.trim());
        } catch (e) {
          console.warn('Invalid else schema JSON:', e);
        }
      }
    }

    // Handle composition schemas
    ['allOf', 'anyOf', 'oneOf'].forEach(key => {
      if (formValue[key] && formValue[key].trim()) {
        try {
          props[key as keyof SchemaProperty] = JSON.parse(formValue[key].trim()) as any;
        } catch (e) {
          console.warn(`Invalid ${key} JSON:`, e);
        }
      }
    });

    if (formValue.not && formValue.not.trim()) {
      try {
        props.not = JSON.parse(formValue.not.trim());
      } catch (e) {
        console.warn('Invalid not schema JSON:', e);
      }
    }

    // Type-specific properties
    switch (type) {
      case PropertyType.STRING:
        if (formValue.minLength !== null && formValue.minLength !== '' && !isNaN(formValue.minLength)) {
          props.minLength = Number(formValue.minLength);
        }
        if (formValue.maxLength !== null && formValue.maxLength !== '' && !isNaN(formValue.maxLength)) {
          props.maxLength = Number(formValue.maxLength);
        }
        if (formValue.pattern && formValue.pattern.trim() !== '') {
          props.pattern = formValue.pattern.trim();
        }
        if (formValue.format && formValue.format.trim() !== '') {
          props.format = formValue.format.trim();
        }
        
        // Draft 7+ content properties
        if (this.supportedFeatures.includes('contentEncoding') && formValue.contentEncoding) {
          props.contentEncoding = formValue.contentEncoding;
        }
        if (this.supportedFeatures.includes('contentMediaType') && formValue.contentMediaType) {
          props.contentMediaType = formValue.contentMediaType;
        }
        break;
        
      case PropertyType.NUMBER:
      case PropertyType.INTEGER:
        if (formValue.minimum !== null && formValue.minimum !== '' && !isNaN(formValue.minimum)) {
          props.minimum = Number(formValue.minimum);
        }
        if (formValue.maximum !== null && formValue.maximum !== '' && !isNaN(formValue.maximum)) {
          props.maximum = Number(formValue.maximum);
        }
        
        // Handle exclusive constraints based on draft
        if (this.exclusiveMinimumType === 'number') {
          if (formValue.exclusiveMinimum !== null && formValue.exclusiveMinimum !== '' && !isNaN(formValue.exclusiveMinimum)) {
            props.exclusiveMinimum = Number(formValue.exclusiveMinimum);
          }
          if (formValue.exclusiveMaximum !== null && formValue.exclusiveMaximum !== '' && !isNaN(formValue.exclusiveMaximum)) {
            props.exclusiveMaximum = Number(formValue.exclusiveMaximum);
          }
        } else {
          props.exclusiveMinimum = formValue.exclusiveMinimumBoolean;
          props.exclusiveMaximum = formValue.exclusiveMaximumBoolean;
        }
        
        if (formValue.multipleOf !== null && formValue.multipleOf !== '' && !isNaN(formValue.multipleOf)) {
          props.multipleOf = Number(formValue.multipleOf);
        }
        break;
        
      case PropertyType.ARRAY:
        if (formValue.minItems !== null && formValue.minItems !== '' && !isNaN(formValue.minItems)) {
          props.minItems = Number(formValue.minItems);
        }
        if (formValue.maxItems !== null && formValue.maxItems !== '' && !isNaN(formValue.maxItems)) {
          props.maxItems = Number(formValue.maxItems);
        }
        props.uniqueItems = formValue.uniqueItems;
        props.additionalItems = formValue.additionalItems;
        break;
        
      case PropertyType.OBJECT:
        if (formValue.minProperties !== null && formValue.minProperties !== '' && !isNaN(formValue.minProperties)) {
          props.minProperties = Number(formValue.minProperties);
        }
        if (formValue.maxProperties !== null && formValue.maxProperties !== '' && !isNaN(formValue.maxProperties)) {
          props.maxProperties = Number(formValue.maxProperties);
        }
        props.additionalProperties = formValue.additionalProperties;
        
        // Handle property names pattern (Draft 6+)
        if (this.supportedFeatures.includes('propertyNames') && formValue.propertyNamesPattern && formValue.propertyNamesPattern.trim()) {
          props.propertyNames = {
            id: 'propertyNames',
            name: 'propertyNames',
            type: PropertyType.STRING,
            pattern: formValue.propertyNamesPattern.trim(),
            validationRules: []
          };
        }
        break;
    }

    return props;
  }

  private parseValueForType(value: string, type: PropertyType): any {
    switch (type) {
      case PropertyType.NUMBER:
      case PropertyType.INTEGER:
        const num = Number(value);
        return isNaN(num) ? value : num;
      case PropertyType.BOOLEAN:
        if (value.toLowerCase() === 'true') return true;
        if (value.toLowerCase() === 'false') return false;
        return value;
      case PropertyType.NULL:
        return value.toLowerCase() === 'null' ? null : value;
      default:
        return value;
    }
  }

  // Type checking methods
  isStringType(): boolean {
    return this.property.type === PropertyType.STRING;
  }

  isNumberType(): boolean {
    return this.property.type === PropertyType.NUMBER || this.property.type === PropertyType.INTEGER;
  }

  isArrayType(): boolean {
    return this.property.type === PropertyType.ARRAY;
  }

  isObjectType(): boolean {
    return this.property.type === PropertyType.OBJECT;
  }

  // Nesting management
  hasChildren(): boolean {
    if (this.isArrayType()) return true;
    
    if (this.isObjectType()) {
      // Check if there are any child properties in direct properties, oneOf, dependentSchemas, or conditionals
      return this.getObjectProperties().length > 0;
    }
    
    return false;
  }

  canAddChildren(): boolean {
    return this.isObjectType() || this.isArrayType();
  }
  
  shouldSuggestReference(): boolean {
    return this.level >= 3;
  }
  
  getReferenceInfo(): string {
    if (this.level >= 3) {
      return `Deep nesting (level ${this.level}). Consider using $ref patterns for better schema organization.`;
    }
    return '';
  }

  emitChange(): void {
    this.updateProperty();
    this.propertyChange.emit(this.property);
  }

  toggleExpanded(): void {
    this.isExpanded = !this.isExpanded;
  }

  toggleAdvanced(): void {
    this.showAdvanced = !this.showAdvanced;
  }

  addChild(): void {
    if (this.property.type === PropertyType.OBJECT) {
      this.addObjectProperty();
    } else if (this.property.type === PropertyType.ARRAY && !this.property.items) {
      // Create default items schema for arrays
      this.property.items = {
        id: this.generateId(),
        name: 'item',
        type: PropertyType.STRING,
        title: '',
        description: '',
        required: false,
        validationRules: []
      };
      this.propertyChange.emit(this.property);
    }
  }

  // Object property management
  getObjectProperties(): SchemaProperty[] {
    const properties: SchemaProperty[] = [];
    
    // Get direct properties
    if (this.property.properties) {
      properties.push(...Object.keys(this.property.properties).map(key => this.property.properties![key]));
    }
    
    // Get properties from oneOf schemas
    if (this.property.oneOf && Array.isArray(this.property.oneOf)) {
      this.property.oneOf.forEach((schema, index) => {
        if (schema.properties) {
          Object.keys(schema.properties).forEach(key => {
            // Check if property already exists to avoid duplicates
            if (!properties.find(p => p.name === key)) {
              const prop = { ...schema.properties![key] };
              prop.title = prop.title || `${key} (oneOf variant ${index + 1})`;
              properties.push(prop);
            }
          });
        }
      });
    }
    
    // Get properties from dependentSchemas
    if (this.property.dependentSchemas) {
      Object.keys(this.property.dependentSchemas).forEach(dependentKey => {
        const schema = this.property.dependentSchemas![dependentKey];
        if (schema.properties) {
          Object.keys(schema.properties).forEach(key => {
            // Check if property already exists to avoid duplicates
            if (!properties.find(p => p.name === key)) {
              const prop = { ...schema.properties![key] };
              prop.title = prop.title || `${key} (when ${dependentKey} present)`;
              properties.push(prop);
            }
          });
        }
      });
    }
    
    // Get properties from if/then/else schemas
    const conditionalSchemas = [this.property.if, this.property.then, this.property.else].filter(Boolean);
    conditionalSchemas.forEach((schema, index) => {
      if (schema && schema.properties) {
        Object.keys(schema.properties).forEach(key => {
          if (!properties.find(p => p.name === key)) {
            const prop = { ...schema.properties![key] };
            const labels = ['condition', 'then', 'else'];
            prop.title = prop.title || `${key} (${labels[index] || 'conditional'})`;
            properties.push(prop);
          }
        });
      }
    });
    
    return properties;
  }

  addObjectProperty(): void {
    if (!this.canAddChildren()) return;
    
    if (!this.property.properties) {
      this.property.properties = {};
    }

    const newPropertyName = this.generateUniquePropertyName();
    const newProperty: SchemaProperty = {
      id: this.generateId(),
      name: newPropertyName,
      type: PropertyType.STRING,
      title: '',
      description: '',
      required: false,
      validationRules: []
    };

    this.property.properties[newPropertyName] = newProperty;
    this.propertyChange.emit(this.property);
  }

  removeObjectProperty(propertyName: string): void {
    if (this.property.properties && this.property.properties[propertyName]) {
      delete this.property.properties[propertyName];
      this.propertyChange.emit(this.property);
    }
  }

  onObjectPropertyChange(propertyName: string, updatedProperty: SchemaProperty): void {
    if (this.property.properties) {
      // Handle property name changes
      if (propertyName !== updatedProperty.name) {
        delete this.property.properties[propertyName];
        this.property.properties[updatedProperty.name] = updatedProperty;
      } else {
        this.property.properties[propertyName] = updatedProperty;
      }
      this.propertyChange.emit(this.property);
    }
  }

  // Array items management
  hasArrayItems(): boolean {
    return this.isArrayType() && !!this.property.items;
  }

  createArrayItems(): void {
    if (!this.isArrayType()) return;
    
    this.property.items = this.createDefaultArrayItem();
    this.propertyChange.emit(this.property);
  }

  removeArrayItems(): void {
    if (this.property.items) {
      delete this.property.items;
      this.propertyChange.emit(this.property);
    }
  }

  onArrayItemsChange(updatedItems: SchemaProperty): void {
    this.property.items = updatedItems;
    this.propertyChange.emit(this.property);
  }

  // Additional methods needed by the template
  updateItems(updatedProperty: SchemaProperty): void {
    if (this.property.type === PropertyType.ARRAY) {
      this.property.items = updatedProperty;
      this.emitChange();
    }
  }

  removeItems(): void {
    if (this.property.type === PropertyType.ARRAY) {
      this.property.items = undefined;
      this.emitChange();
    }
  }

  updateChildProperty(propertyId: string, updatedProperty: SchemaProperty): void {
    if (this.property.type === PropertyType.OBJECT && this.property.properties) {
      const index = this.getObjectProperties().findIndex(p => p.id === propertyId);
      if (index !== -1) {
        const oldName = this.getObjectProperties()[index].name;
        
        // Validate new name to ensure it doesn't conflict with siblings
        const validatedName = this.validateChildPropertyName(updatedProperty.name, propertyId);
        
        // Update the property with the validated name
        const finalProperty = { ...updatedProperty, name: validatedName };
        
        // Only delete and recreate if the name actually changed
        if (oldName !== validatedName) {
          delete this.property.properties[oldName];
        }
        
        this.property.properties[validatedName] = finalProperty;
        this.emitChange();
      }
    }
  }

  private validateChildPropertyName(newName: string, excludePropertyId: string): string {
    if (!newName || newName.trim() === '') {
      return 'untitled'; // Provide default name for empty strings
    }

    const trimmedName = newName.trim();
    
    if (this.property.type === PropertyType.OBJECT && this.property.properties) {
      const siblingNames = this.getObjectProperties()
        .filter(p => p.id !== excludePropertyId) // Exclude the property being updated
        .map(p => p.name);
      
      if (siblingNames.includes(trimmedName)) {
        // Generate a unique name by appending a number
        let counter = 1;
        let uniqueName = `${trimmedName}_${counter}`;
        while (siblingNames.includes(uniqueName)) {
          counter++;
          uniqueName = `${trimmedName}_${counter}`;
        }
        return uniqueName;
      }
    }
    
    return trimmedName;
  }

  removeChildProperty(propertyId: string): void {
    if (this.property.type === PropertyType.OBJECT && this.property.properties) {
      const propertyToRemove = this.getObjectProperties().find(p => p.id === propertyId);
      if (propertyToRemove) {
        delete this.property.properties[propertyToRemove.name];
        this.emitChange();
      }
    }
  }

  private createDefaultArrayItem(): SchemaProperty {
    return {
      id: this.generateId(),
      name: 'items',
      type: PropertyType.STRING,
      title: '',
      description: '',
      required: false,
      validationRules: []
    };
  }

  // Utility methods
  private generateUniquePropertyName(): string {
    const baseName = 'property';
    const existingNames = this.property.properties ? Object.keys(this.property.properties) : [];
    let counter = 1;
    let newName = baseName;
    
    while (existingNames.includes(newName)) {
      newName = `${baseName}${counter}`;
      counter++;
    }
    
    return newName;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  private createNewProperty(): SchemaProperty {
    return {
      id: this.generateId(),
      name: 'property',
      type: PropertyType.STRING,
      title: '',
      description: '',
      required: false,
      validationRules: []
    };
  }

  // Delete this property
  onDelete(): void {
    this.deleteProperty.emit();
  }

  // Track function for ngFor - use ID instead of name to prevent re-rendering on name changes
  trackByPropertyName(index: number, property: SchemaProperty): string {
    return property.id; // Use stable ID instead of mutable name
  }



  // Template helper methods for form bindings
  onNameChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.propertyForm.get('name')?.setValue(target.value);
  }

  onRequiredChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.propertyForm.get('required')?.setValue(target.checked);
  }

  onTypeChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newType = target.value as PropertyType;
    
    // Clear old type-specific properties before setting new type
    if (this.previousType && this.previousType !== newType) {
      this.clearTypeSpecificProperties(this.previousType);
    }
    
    this.propertyForm.get('type')?.setValue(newType);
    this.previousType = newType;
  }

  // OneOf Editor integration
  updateOneOfVariants(variants: SchemaProperty[]): void {
    this.property.oneOf = variants;
    this.updateProperty();
    this.emitChange();
  }

  // Dependency Editor integration
  updateDependentSchemas(dependentSchemas: { [key: string]: SchemaProperty }): void {
    this.property.dependentSchemas = Object.keys(dependentSchemas).length > 0 ? dependentSchemas : undefined;
    this.updateProperty();
    this.emitChange();
  }

  // Pattern Properties Editor integration
  updatePatternProperties(patternProperties: { [key: string]: SchemaProperty }): void {
    this.property.patternProperties = Object.keys(patternProperties).length > 0 ? patternProperties : undefined;
    this.updateProperty();
    this.emitChange();
  }

  // Advanced Array Editor integration
  updatePrefixItems(prefixItems: SchemaProperty[]): void {
    this.property.prefixItems = prefixItems.length > 0 ? prefixItems : undefined;
    this.updateProperty();
    this.emitChange();
  }

  updateUnevaluatedItems(unevaluatedItems: SchemaProperty | boolean): void {
    this.property.unevaluatedItems = unevaluatedItems;
    this.updateProperty();
    this.emitChange();
  }

  updateArrayItems(items: SchemaProperty | boolean): void {
    // Handle boolean case by setting to undefined if false, or converting to schema if true
    if (typeof items === 'boolean') {
      if (items) {
        // Create a permissive schema when items is true
        this.property.items = {
          id: Math.random().toString(36).substr(2, 9),
          name: 'item',
          type: PropertyType.STRING,
          required: false,
          description: 'Array item',
          validationRules: []
        };
      } else {
        this.property.items = undefined; // No items allowed
      }
    } else {
      this.property.items = items;
    }
    this.updateProperty();
    this.emitChange();
  }

  // Reference Manager integration
  updateDefinitions(definitions: { [key: string]: SchemaProperty }): void {
    this.definitionsUpdate.emit(definitions);
  }

  updatePropertyReference(event: { property: SchemaProperty; ref: string }): void {
    if (event.ref) {
      event.property.$ref = event.ref;
      // Clear other properties when using a reference
      event.property.type = PropertyType.STRING; // Reset to default
      delete event.property.properties;
      delete event.property.items;
    } else {
      delete event.property.$ref;
    }
    this.propertyReferenceUpdate.emit(event);
    this.updateProperty();
    this.emitChange();
  }

  getAvailablePropertiesForDependencies(): string[] {
    const allProperties: string[] = [];
    
    // Get properties from this object
    if (this.property.properties) {
      allProperties.push(...Object.keys(this.property.properties));
    }
    
    // Get properties from oneOf variants
    if (this.property.oneOf) {
      this.property.oneOf.forEach(variant => {
        if (variant.properties) {
          allProperties.push(...Object.keys(variant.properties));
        }
      });
    }
    
    // Remove duplicates and return
    return [...new Set(allProperties)].sort();
  }

  createVisualOneOf(): void {
    // Try to parse existing JSON in the textarea first
    const oneOfFormValue = this.propertyForm.get('oneOf')?.value;
    let initialVariants: SchemaProperty[] = [];

    if (oneOfFormValue && oneOfFormValue.trim()) {
      try {
        const parsed = JSON.parse(oneOfFormValue);
        if (Array.isArray(parsed)) {
          initialVariants = parsed.map((schema: any, index: number) => ({
            id: this.generateId(),
            name: `variant_${index}`,
            type: schema.type || PropertyType.OBJECT,
            title: schema.title || `Variant ${index + 1}`,
            description: schema.description || '',
            required: false,
            validationRules: [],
            ...schema
          }));
        }
      } catch (error) {
        console.warn('Could not parse existing oneOf JSON, creating default variants');
      }
    }

    // Create default variants if none exist
    if (initialVariants.length === 0) {
      initialVariants = [
        {
          id: this.generateId(),
          name: 'variant_1',
          type: PropertyType.OBJECT,
          title: 'Variant 1',
          description: '',
          required: false,
          validationRules: [],
          properties: {}
        }
      ];
    }

    this.property.oneOf = initialVariants;
    this.propertyForm.get('oneOf')?.setValue(''); // Clear the textarea
    this.updateProperty();
    this.emitChange();
  }
}
