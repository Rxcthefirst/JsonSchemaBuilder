import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SchemaProperty, PropertyType } from '../../models/schema.models';

interface OneOfVariant {
  id: string;
  title: string;
  description?: string;
  schema: SchemaProperty;
  isActive: boolean;
}

@Component({
  selector: 'app-oneof-editor',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './oneof-editor.component.html',
  styleUrl: './oneof-editor.component.scss'
})
export class OneOfEditorComponent implements OnInit, OnChanges {
  @Input() variants: SchemaProperty[] = [];
  @Input() currentDraft: string = 'draft-2020-12';
  @Output() variantsChange = new EventEmitter<SchemaProperty[]>();

  PropertyType = PropertyType; // Make PropertyType available in template
  oneOfVariants: OneOfVariant[] = [];
  activeVariantId: string = '';
  showAddVariant = false;

  ngOnInit() {
    this.initializeVariants();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['variants']) {
      this.initializeVariants();
    }
  }

  private initializeVariants() {
    this.oneOfVariants = this.variants.map((variant, index) => ({
      id: this.generateId(),
      title: variant.title || `Variant ${index + 1}`,
      description: variant.description,
      schema: { ...variant },
      isActive: index === 0
    }));

    if (this.oneOfVariants.length > 0) {
      this.activeVariantId = this.oneOfVariants[0].id;
    }
  }

  get activeVariant(): OneOfVariant | undefined {
    return this.oneOfVariants.find(v => v.id === this.activeVariantId);
  }

  selectVariant(variantId: string) {
    this.oneOfVariants.forEach(v => v.isActive = v.id === variantId);
    this.activeVariantId = variantId;
  }

  addVariant() {
    const newVariant: OneOfVariant = {
      id: this.generateId(),
      title: `Variant ${this.oneOfVariants.length + 1}`,
      description: '',
      schema: {
        id: this.generateId(),
        name: '',
        type: PropertyType.OBJECT,
        title: '',
        description: '',
        required: false,
        validationRules: [],
        properties: {}
      },
      isActive: false
    };

    this.oneOfVariants.push(newVariant);
    this.selectVariant(newVariant.id);
    this.showAddVariant = false;
    this.emitChanges();
  }

  removeVariant(variantId: string) {
    const index = this.oneOfVariants.findIndex(v => v.id === variantId);
    if (index === -1 || this.oneOfVariants.length <= 1) return;

    this.oneOfVariants.splice(index, 1);
    
    // Select a different variant if we deleted the active one
    if (this.activeVariantId === variantId) {
      const newActiveIndex = Math.max(0, index - 1);
      this.selectVariant(this.oneOfVariants[newActiveIndex].id);
    }

    this.emitChanges();
  }

  updateVariantTitle(variantId: string, newTitle: string) {
    const variant = this.oneOfVariants.find(v => v.id === variantId);
    if (variant) {
      variant.title = newTitle;
      variant.schema.title = newTitle;
      this.emitChanges();
    }
  }

  updateVariantDescription(variantId: string, newDescription: string) {
    const variant = this.oneOfVariants.find(v => v.id === variantId);
    if (variant) {
      variant.description = newDescription;
      variant.schema.description = newDescription;
      this.emitChanges();
    }
  }

  onVariantSchemaChange(updatedSchema: SchemaProperty) {
    const variant = this.activeVariant;
    if (variant) {
      variant.schema = { ...updatedSchema };
      variant.title = updatedSchema.title || variant.title;
      variant.description = updatedSchema.description || variant.description;
      this.emitChanges();
    }
  }

  private emitChanges() {
    const schemas = this.oneOfVariants.map(v => v.schema);
    this.variantsChange.emit(schemas);
  }

  private generateId(): string {
    return 'oneof_' + Math.random().toString(36).substr(2, 9);
  }

  toggleAddVariant() {
    this.showAddVariant = !this.showAddVariant;
  }

  // Helper method to get discriminator information
  getDiscriminatorInfo(): string {
    const discriminators = new Set<string>();
    
    this.oneOfVariants.forEach(variant => {
      if (variant.schema.properties) {
        Object.keys(variant.schema.properties).forEach(key => {
          const prop = variant.schema.properties![key];
          if (prop.const !== undefined) {
            discriminators.add(key);
          }
        });
      }
    });
    
    return discriminators.size > 0 
      ? `Discriminator fields: ${Array.from(discriminators).join(', ')}`
      : 'No discriminator fields detected';
  }
}