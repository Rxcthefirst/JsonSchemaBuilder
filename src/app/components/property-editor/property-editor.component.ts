import { Component, Input, Output, EventEmitter, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, FormGroup } from '@angular/forms';
import { Subject, takeUntil } from 'rxjs';
import { 
  SchemaProperty, 
  PropertyType, 
  DEFAULT_STRING_FORMATS, 
  VALIDATION_RULE_TYPES 
} from '../../models/schema.models';

@Component({
  selector: 'app-property-editor',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './property-editor.component.html',
  styleUrl: './property-editor.component.scss'
})
export class PropertyEditorComponent implements OnInit, OnDestroy {
  @Input() property!: SchemaProperty;
  @Input() nestingDepth: number = 0;
  @Output() propertyChange = new EventEmitter<SchemaProperty>();

  private destroy$ = new Subject<void>();
  private previousType: PropertyType | null = null;
  
  propertyForm!: FormGroup;
  propertyTypes = Object.values(PropertyType);
  stringFormats = DEFAULT_STRING_FORMATS['draft-07'] || []; // Default to draft-07 formats
  validationRuleTypes = VALIDATION_RULE_TYPES;
  
  showAdvancedOptions = false;

  constructor(private fb: FormBuilder) {}

  ngOnInit(): void {
    this.initializeForm();
    this.subscribeToFormChanges();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private initializeForm(): void {
    this.propertyForm = this.fb.group({
      name: [this.property.name],
      type: [this.property.type],
      title: [this.property.title || ''],
      description: [this.property.description || ''],
      required: [this.property.required || false],
      defaultValue: [this.property.defaultValue],
      
      // String-specific
      minLength: [this.property.minLength],
      maxLength: [this.property.maxLength],
      pattern: [this.property.pattern || ''],
      format: [this.property.format || ''],
      
      // Number/Integer-specific
      minimum: [this.property.minimum],
      maximum: [this.property.maximum],
      exclusiveMinimum: [this.property.exclusiveMinimum],
      exclusiveMaximum: [this.property.exclusiveMaximum],
      multipleOf: [this.property.multipleOf],
      
      // Array-specific
      minItems: [this.property.minItems],
      maxItems: [this.property.maxItems],
      uniqueItems: [this.property.uniqueItems || false],
      
      // Object-specific
      minProperties: [this.property.minProperties],
      maxProperties: [this.property.maxProperties],
      additionalProperties: [this.property.additionalProperties !== false],
      
      // Enum values
      enumValues: [this.property.enum ? this.property.enum.join(', ') : '']
    });
  }

  private subscribeToFormChanges(): void {
    // Subscribe to type changes specifically
    this.propertyForm.get('type')?.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe((newType: PropertyType) => {
        this.onTypeChange(newType);
      });
    
    // Subscribe to all other form changes
    this.propertyForm.valueChanges
      .pipe(takeUntil(this.destroy$))
      .subscribe(() => {
        this.emitPropertyChange();
      });
  }

  private onTypeChange(newType: PropertyType): void {
    if (this.previousType && this.previousType !== newType) {
      this.clearTypeSpecificData(this.previousType);
    }
    this.previousType = newType;
  }

  private clearTypeSpecificData(oldType: PropertyType): void {
    const updatedProperty = { ...this.property };
    
    // Clear old type-specific properties
    switch (oldType) {
      case PropertyType.STRING:
        delete updatedProperty.minLength;
        delete updatedProperty.maxLength;
        delete updatedProperty.pattern;
        delete updatedProperty.format;
        break;
      case PropertyType.NUMBER:
      case PropertyType.INTEGER:
        delete updatedProperty.minimum;
        delete updatedProperty.maximum;
        delete updatedProperty.exclusiveMinimum;
        delete updatedProperty.exclusiveMaximum;
        delete updatedProperty.multipleOf;
        break;
      case PropertyType.ARRAY:
        delete updatedProperty.minItems;
        delete updatedProperty.maxItems;
        delete updatedProperty.uniqueItems;
        delete updatedProperty.items;
        break;
      case PropertyType.OBJECT:
        delete updatedProperty.minProperties;
        delete updatedProperty.maxProperties;
        delete updatedProperty.additionalProperties;
        delete updatedProperty.properties;
        break;
    }
    
    // Clear enum for all types
    delete updatedProperty.enum;
    
    // Update the property and emit change
    this.property = updatedProperty;
    this.emitPropertyChange();
  }

  private emitPropertyChange(): void {
    const formValue = this.propertyForm.value;
    const updatedProperty: SchemaProperty = {
      ...this.property,
      name: formValue.name,
      type: formValue.type,
      title: formValue.title,
      description: formValue.description,
      required: formValue.required,
      defaultValue: this.parseDefaultValue(formValue.defaultValue, formValue.type),
      
      // String-specific
      minLength: this.parseNumber(formValue.minLength),
      maxLength: this.parseNumber(formValue.maxLength),
      pattern: formValue.pattern || undefined,
      format: formValue.format || undefined,
      
      // Number/Integer-specific
      minimum: this.parseNumber(formValue.minimum),
      maximum: this.parseNumber(formValue.maximum),
      exclusiveMinimum: this.parseNumber(formValue.exclusiveMinimum),
      exclusiveMaximum: this.parseNumber(formValue.exclusiveMaximum),
      multipleOf: this.parseNumber(formValue.multipleOf),
      
      // Array-specific
      minItems: this.parseNumber(formValue.minItems),
      maxItems: this.parseNumber(formValue.maxItems),
      uniqueItems: formValue.uniqueItems,
      
      // Object-specific
      minProperties: this.parseNumber(formValue.minProperties),
      maxProperties: this.parseNumber(formValue.maxProperties),
      additionalProperties: formValue.additionalProperties,
      
      // Enum values
      enum: this.parseEnumValues(formValue.enumValues)
    };

    this.propertyChange.emit(updatedProperty);
  }

  private parseNumber(value: any): number | undefined {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }
    const num = Number(value);
    return isNaN(num) ? undefined : num;
  }

  private parseDefaultValue(value: any, type: PropertyType): any {
    if (value === null || value === undefined || value === '') {
      return undefined;
    }

    switch (type) {
      case PropertyType.NUMBER:
      case PropertyType.INTEGER:
        const num = Number(value);
        return isNaN(num) ? undefined : num;
      case PropertyType.BOOLEAN:
        return value === true || value === 'true';
      case PropertyType.ARRAY:
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      case PropertyType.OBJECT:
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      default:
        return value;
    }
  }

  private parseEnumValues(enumString: string): any[] | undefined {
    if (!enumString || enumString.trim() === '') {
      return undefined;
    }
    
    return enumString.split(',').map(val => {
      const trimmed = val.trim();
      // Try to parse as number if possible
      const num = Number(trimmed);
      if (!isNaN(num)) {
        return num;
      }
      // Try to parse as boolean
      if (trimmed.toLowerCase() === 'true') return true;
      if (trimmed.toLowerCase() === 'false') return false;
      // Return as string
      return trimmed;
    });
  }

  toggleAdvancedOptions(): void {
    this.showAdvancedOptions = !this.showAdvancedOptions;
  }

  // Nesting management methods
  canAddNestedProperty(): boolean {
    return true; // Allow unlimited nesting
  }

  shouldSuggestReference(): boolean {
    return this.nestingDepth >= 3;
  }

  getNestingWarningMessage(): string {
    if (this.nestingDepth >= 3) {
      return `Deep nesting detected (level ${this.nestingDepth}). Consider using $ref patterns for better organization.`;
    }
    return '';
  }

  isStringType(): boolean {
    return this.propertyForm?.get('type')?.value === PropertyType.STRING;
  }

  isNumberType(): boolean {
    const type = this.propertyForm?.get('type')?.value;
    return type === PropertyType.NUMBER || type === PropertyType.INTEGER;
  }

  isArrayType(): boolean {
    return this.propertyForm?.get('type')?.value === PropertyType.ARRAY;
  }

  isObjectType(): boolean {
    return this.propertyForm?.get('type')?.value === PropertyType.OBJECT;
  }

  isBooleanType(): boolean {
    return this.propertyForm?.get('type')?.value === PropertyType.BOOLEAN;
  }

  getAvailableValidationRules(): string[] {
    const type = this.propertyForm?.get('type')?.value as PropertyType;
    return this.validationRuleTypes[type] || [];
  }

  getDefaultValuePlaceholder(): string {
    const type = this.propertyForm?.get('type')?.value as PropertyType;
    switch (type) {
      case PropertyType.STRING:
        return 'Enter string value';
      case PropertyType.NUMBER:
        return 'Enter number';
      case PropertyType.INTEGER:
        return 'Enter integer';
      case PropertyType.BOOLEAN:
        return 'true or false';
      case PropertyType.ARRAY:
        return '[1, 2, 3]';
      case PropertyType.OBJECT:
        return '{"key": "value"}';
      default:
        return 'Enter default value';
    }
  }

  // Object property management
  addObjectProperty(): void {
    if (!this.property.properties) {
      this.property.properties = {};
    }
    
    const newPropertyName = this.generateUniquePropertyName();
    const currentDepth = this.nestingDepth + 1;
    
    const newProperty: SchemaProperty = {
      id: this.generateId(),
      name: newPropertyName,
      type: PropertyType.STRING,
      title: '',
      description: '',
      required: false,
      validationRules: [],
      nestingDepth: currentDepth
    };
    
    this.property.properties[newPropertyName] = newProperty;
    this.emitPropertyChange();
  }

  removeObjectProperty(propertyName: string): void {
    if (this.property.properties && this.property.properties[propertyName]) {
      delete this.property.properties[propertyName];
      this.emitPropertyChange();
    }
  }

  updateObjectProperty(oldName: string, updatedProperty: SchemaProperty): void {
    if (!this.property.properties) return;
    
    // If name changed, remove old and add new
    if (oldName !== updatedProperty.name) {
      delete this.property.properties[oldName];
    }
    
    this.property.properties[updatedProperty.name] = updatedProperty;
    this.emitPropertyChange();
  }

  getObjectPropertiesArray(): Array<{ key: string; property: SchemaProperty }> {
    if (!this.property.properties) return [];
    
    return Object.entries(this.property.properties).map(([key, property]) => ({ key, property }));
  }

  // Array items management
  createArrayItems(): void {
    this.property.items = {
      id: this.generateId(),
      name: 'items',
      type: PropertyType.STRING,
      title: '',
      description: '',
      required: false,
      validationRules: []
    };
    this.emitPropertyChange();
  }

  removeArrayItems(): void {
    this.property.items = undefined;
    this.emitPropertyChange();
  }

  updateArrayItems(updatedItems: SchemaProperty): void {
    this.property.items = updatedItems;
    this.emitPropertyChange();
  }

  private generateUniquePropertyName(): string {
    let counter = 1;
    let name = 'property1';
    
    while (this.property.properties && this.property.properties[name]) {
      counter++;
      name = `property${counter}`;
    }
    
    return name;
  }

  private generateId(): string {
    return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  }

  trackByPropertyKey(index: number, item: { key: string; property: SchemaProperty }): string {
    return item.key;
  }

  // Object property inline editing methods
  updatePropertyName(oldKey: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    const newName = target.value;
    
    if (!this.property.properties || !this.property.properties[oldKey]) return;
    
    const property = this.property.properties[oldKey];
    property.name = newName;
    
    // If name changed, update the key in the properties object
    if (oldKey !== newName) {
      delete this.property.properties[oldKey];
      this.property.properties[newName] = property;
    }
    
    this.emitPropertyChange();
  }

  updatePropertyType(key: string, event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newType = target.value as PropertyType;
    
    if (!this.property.properties || !this.property.properties[key]) return;
    
    this.property.properties[key].type = newType;
    this.emitPropertyChange();
  }

  updatePropertyTitle(key: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    
    if (!this.property.properties || !this.property.properties[key]) return;
    
    this.property.properties[key].title = target.value;
    this.emitPropertyChange();
  }

  updatePropertyDescription(key: string, event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    
    if (!this.property.properties || !this.property.properties[key]) return;
    
    this.property.properties[key].description = target.value;
    this.emitPropertyChange();
  }

  updatePropertyRequired(key: string, event: Event): void {
    const target = event.target as HTMLInputElement;
    
    if (!this.property.properties || !this.property.properties[key]) return;
    
    this.property.properties[key].required = target.checked;
    this.emitPropertyChange();
  }

  // Array items inline editing methods
  updateArrayItemsType(event: Event): void {
    const target = event.target as HTMLSelectElement;
    const newType = target.value as PropertyType;
    
    if (!this.property.items) return;
    
    this.property.items.type = newType;
    this.emitPropertyChange();
  }

  updateArrayItemsTitle(event: Event): void {
    const target = event.target as HTMLInputElement;
    
    if (!this.property.items) return;
    
    this.property.items.title = target.value;
    this.emitPropertyChange();
  }

  updateArrayItemsDescription(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    
    if (!this.property.items) return;
    
    this.property.items.description = target.value;
    this.emitPropertyChange();
  }
}
