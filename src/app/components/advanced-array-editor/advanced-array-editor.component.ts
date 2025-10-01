import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchemaProperty, PropertyType } from '../../models/schema.models';

interface PrefixItem {
  index: number;
  schema: SchemaProperty;
}

@Component({
  selector: 'app-advanced-array-editor',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './advanced-array-editor.component.html',
  styleUrls: ['./advanced-array-editor.component.scss']
})
export class AdvancedArrayEditorComponent implements OnInit, OnChanges {
  @Input() prefixItems: SchemaProperty[] = [];
  @Input() unevaluatedItems: SchemaProperty | boolean = true;
  @Input() items: SchemaProperty | boolean = true;
  @Input() currentDraft: string = 'draft-07';
  
  @Output() prefixItemsChange = new EventEmitter<SchemaProperty[]>();
  @Output() unevaluatedItemsChange = new EventEmitter<SchemaProperty | boolean>();
  @Output() itemsChange = new EventEmitter<SchemaProperty | boolean>();

  PropertyType = PropertyType;
  prefixItemsList: PrefixItem[] = [];
  
  // Array validation modes
  validationMode: 'simple' | 'positional' | 'advanced' = 'simple';
  
  // UnevaluatedItems options
  unevaluatedItemsMode: 'allow' | 'forbid' | 'schema' = 'allow';
  unevaluatedItemsSchema: SchemaProperty = this.createEmptySchema();
  
  // Items schema for fallback
  itemsMode: 'allow' | 'forbid' | 'schema' = 'schema';
  itemsSchema: SchemaProperty = this.createEmptySchema();

  ngOnInit() {
    this.initializeComponent();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['prefixItems'] || changes['unevaluatedItems'] || changes['items']) {
      this.initializeComponent();
    }
  }

  private initializeComponent() {
    // Initialize prefix items list
    this.prefixItemsList = this.prefixItems.map((schema, index) => ({
      index,
      schema: { ...schema }
    }));

    // Determine validation mode
    if (this.prefixItems.length > 0) {
      this.validationMode = this.currentDraft === 'draft-2020-12' ? 'positional' : 'advanced';
    } else if (typeof this.items === 'object' && this.items) {
      this.validationMode = 'simple';
    } else {
      this.validationMode = 'simple';
    }

    // Initialize unevaluatedItems mode
    if (typeof this.unevaluatedItems === 'boolean') {
      this.unevaluatedItemsMode = this.unevaluatedItems ? 'allow' : 'forbid';
    } else if (this.unevaluatedItems) {
      this.unevaluatedItemsMode = 'schema';
      this.unevaluatedItemsSchema = { ...this.unevaluatedItems };
    }

    // Initialize items mode
    if (typeof this.items === 'boolean') {
      this.itemsMode = this.items ? 'allow' : 'forbid';
    } else if (this.items) {
      this.itemsMode = 'schema';
      this.itemsSchema = { ...this.items };
    }
  }

  private createEmptySchema(): SchemaProperty {
    return {
      id: Math.random().toString(36).substr(2, 9),
      name: '',
      type: PropertyType.STRING,
      required: false,
      description: '',
      validationRules: []
    };
  }

  // Validation Mode Management
  onValidationModeChange() {
    switch (this.validationMode) {
      case 'simple':
        this.prefixItemsList = [];
        this.emitPrefixItems();
        break;
      case 'positional':
        if (this.prefixItemsList.length === 0) {
          this.addPrefixItem();
        }
        break;
      case 'advanced':
        // Keep existing prefix items
        break;
    }
  }

  // Prefix Items Management
  addPrefixItem() {
    const newIndex = this.prefixItemsList.length;
    this.prefixItemsList.push({
      index: newIndex,
      schema: this.createEmptySchema()
    });
    this.emitPrefixItems();
  }

  removePrefixItem(index: number) {
    this.prefixItemsList.splice(index, 1);
    // Reindex items
    this.prefixItemsList.forEach((item, idx) => {
      item.index = idx;
    });
    this.emitPrefixItems();
  }

  movePrefixItemUp(index: number) {
    if (index > 0) {
      const item = this.prefixItemsList[index];
      this.prefixItemsList[index] = this.prefixItemsList[index - 1];
      this.prefixItemsList[index - 1] = item;
      this.reindexPrefixItems();
      this.emitPrefixItems();
    }
  }

  movePrefixItemDown(index: number) {
    if (index < this.prefixItemsList.length - 1) {
      const item = this.prefixItemsList[index];
      this.prefixItemsList[index] = this.prefixItemsList[index + 1];
      this.prefixItemsList[index + 1] = item;
      this.reindexPrefixItems();
      this.emitPrefixItems();
    }
  }

  private reindexPrefixItems() {
    this.prefixItemsList.forEach((item, index) => {
      item.index = index;
    });
  }

  updatePrefixItemSchema(index: number, schema: SchemaProperty) {
    if (this.prefixItemsList[index]) {
      this.prefixItemsList[index].schema = { ...schema };
      this.emitPrefixItems();
    }
  }

  // UnevaluatedItems Management
  onUnevaluatedItemsModeChange() {
    switch (this.unevaluatedItemsMode) {
      case 'allow':
        this.unevaluatedItemsChange.emit(true);
        break;
      case 'forbid':
        this.unevaluatedItemsChange.emit(false);
        break;
      case 'schema':
        this.unevaluatedItemsChange.emit(this.unevaluatedItemsSchema);
        break;
    }
  }

  updateUnevaluatedItemsSchema(schema: SchemaProperty) {
    this.unevaluatedItemsSchema = { ...schema };
    if (this.unevaluatedItemsMode === 'schema') {
      this.unevaluatedItemsChange.emit(this.unevaluatedItemsSchema);
    }
  }

  // Items Management (for fallback compatibility)
  onItemsModeChange() {
    switch (this.itemsMode) {
      case 'allow':
        this.itemsChange.emit(true);
        break;
      case 'forbid':
        this.itemsChange.emit(false);
        break;
      case 'schema':
        this.itemsChange.emit(this.itemsSchema);
        break;
    }
  }

  updateItemsSchema(schema: SchemaProperty) {
    this.itemsSchema = { ...schema };
    if (this.itemsMode === 'schema') {
      this.itemsChange.emit(this.itemsSchema);
    }
  }

  // Emit Changes
  private emitPrefixItems() {
    const prefixItems = this.prefixItemsList.map(item => item.schema);
    this.prefixItemsChange.emit(prefixItems);
  }

  // Utility Methods
  getArrayValidationPreview(): string {
    let preview = 'Array Validation: ';
    
    if (this.validationMode === 'positional' && this.prefixItemsList.length > 0) {
      preview += `Position-based validation for first ${this.prefixItemsList.length} items`;
      
      if (this.currentDraft === 'draft-2020-12') {
        if (this.unevaluatedItemsMode === 'allow') {
          preview += ', additional items allowed';
        } else if (this.unevaluatedItemsMode === 'forbid') {
          preview += ', no additional items allowed';
        } else {
          preview += ', additional items validated by schema';
        }
      }
    } else if (this.validationMode === 'simple') {
      if (this.itemsMode === 'schema') {
        preview += 'All items validated by single schema';
      } else if (this.itemsMode === 'allow') {
        preview += 'All items allowed';
      } else {
        preview += 'No items allowed';
      }
    }
    
    return preview;
  }

  isDraft2020Available(): boolean {
    return this.currentDraft === 'draft-2020-12';
  }

  // Common Schema Types for Quick Setup
  getCommonSchemaTemplates() {
    return [
      { name: 'String', type: PropertyType.STRING },
      { name: 'Number', type: PropertyType.NUMBER },
      { name: 'Integer', type: PropertyType.INTEGER },
      { name: 'Boolean', type: PropertyType.BOOLEAN },
      { name: 'Object', type: PropertyType.OBJECT },
      { name: 'Array', type: PropertyType.ARRAY }
    ];
  }

  applySchemaTemplate(template: any, targetSchema: SchemaProperty) {
    targetSchema.type = template.type;
    targetSchema.description = `${template.name} value`;
    
    // Clear type-specific properties
    delete targetSchema.properties;
    delete targetSchema.items;
    delete targetSchema.minimum;
    delete targetSchema.maximum;
    delete targetSchema.pattern;
    delete targetSchema.enum;
    
    this.emitPrefixItems();
  }

  // Track by function for ngFor performance
  trackByIndex(index: number, item: any): number {
    return index;
  }
}