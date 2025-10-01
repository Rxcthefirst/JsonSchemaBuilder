import { Component, Input, Output, EventEmitter, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { SchemaProperty, PropertyType } from '../../models/schema.models';

interface DependencyRule {
  id: string;
  triggerProperty: string;
  triggerValue?: any;
  triggerCondition: 'exists' | 'equals' | 'not-equals' | 'in-array';
  requiredProperties: string[];
  conditionalSchema: SchemaProperty;
  description?: string;
}

@Component({
  selector: 'app-dependency-editor',
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './dependency-editor.component.html',
  styleUrl: './dependency-editor.component.scss'
})
export class DependencyEditorComponent implements OnInit, OnChanges {
  @Input() dependentSchemas: { [key: string]: SchemaProperty } = {};
  @Input() availableProperties: string[] = [];
  @Input() currentDraft: string = 'draft-2020-12';
  @Output() dependentSchemasChange = new EventEmitter<{ [key: string]: SchemaProperty }>();

  PropertyType = PropertyType; // Make PropertyType available in template
  dependencyRules: DependencyRule[] = [];
  showAddRule = false;
  newRuleTriggerProperty = '';
  newRuleTriggerCondition: 'exists' | 'equals' | 'not-equals' | 'in-array' = 'exists';
  newRuleTriggerValue = '';
  editingRuleId: string | null = null;

  readonly triggerConditions = [
    { value: 'exists', label: 'Property exists (has any value)', needsValue: false },
    { value: 'equals', label: 'Property equals (exact match)', needsValue: true },
    { value: 'not-equals', label: 'Property does not equal (not this value)', needsValue: true },
    { value: 'in-array', label: 'Property is one of (comma-separated values)', needsValue: true }
  ] as const;

  ngOnInit() {
    this.initializeDependencyRules();
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['dependentSchemas'] || changes['availableProperties']) {
      this.initializeDependencyRules();
    }
  }

  private initializeDependencyRules() {
    this.dependencyRules = Object.keys(this.dependentSchemas).map(key => {
      const schema = this.dependentSchemas[key];
      return this.createRuleFromSchema(key, schema);
    });
  }

  private createRuleFromSchema(triggerProperty: string, schema: SchemaProperty): DependencyRule {
    // Try to extract condition from if/then structure
    let triggerCondition: DependencyRule['triggerCondition'] = 'exists';
    let triggerValue: any = undefined;
    let conditionalSchema = schema;

    // If the schema has if/then structure, extract the condition
    if (schema.if && schema.then) {
      const ifSchema = schema.if;
      if (ifSchema.properties && ifSchema.properties[triggerProperty]) {
        const propCondition = ifSchema.properties[triggerProperty];
        if (propCondition.const !== undefined) {
          triggerCondition = 'equals';
          triggerValue = propCondition.const;
        } else if (propCondition.enum !== undefined) {
          triggerCondition = 'in-array';
          triggerValue = propCondition.enum.join(', ');
        }
      }
      conditionalSchema = schema.then;
    }

    return {
      id: this.generateId(),
      triggerProperty,
      triggerValue,
      triggerCondition,
      requiredProperties: Array.isArray(conditionalSchema.required) ? conditionalSchema.required : [],
      conditionalSchema,
      description: schema.description
    };
  }

  addDependencyRule() {
    if (!this.newRuleTriggerProperty.trim()) return;

    const newRule: DependencyRule = {
      id: this.generateId(),
      triggerProperty: this.newRuleTriggerProperty.trim(),
      triggerCondition: this.newRuleTriggerCondition,
      triggerValue: this.getTriggerCondition(this.newRuleTriggerCondition).needsValue ? this.newRuleTriggerValue : undefined,
      requiredProperties: [],
      conditionalSchema: {
        id: this.generateId(),
        name: `dependent_${this.newRuleTriggerProperty}`,
        type: PropertyType.OBJECT,
        title: `When ${this.newRuleTriggerProperty} condition is met`,
        description: '',
        required: false,
        validationRules: [],
        properties: {}
      }
    };

    this.dependencyRules.push(newRule);
    this.resetNewRuleForm();
    this.emitChanges();
  }

  removeDependencyRule(ruleId: string) {
    const index = this.dependencyRules.findIndex(r => r.id === ruleId);
    if (index !== -1) {
      this.dependencyRules.splice(index, 1);
      this.emitChanges();
    }
  }

  updateRuleTriggerProperty(ruleId: string, newProperty: string) {
    const rule = this.dependencyRules.find(r => r.id === ruleId);
    if (rule && newProperty.trim()) {
      rule.triggerProperty = newProperty.trim();
      this.emitChanges();
    }
  }

  updateRuleTriggerCondition(ruleId: string, newCondition: DependencyRule['triggerCondition']) {
    const rule = this.dependencyRules.find(r => r.id === ruleId);
    if (rule) {
      rule.triggerCondition = newCondition;
      if (!this.getTriggerCondition(newCondition).needsValue) {
        rule.triggerValue = undefined;
      }
      this.emitChanges();
    }
  }

  updateRuleTriggerValue(ruleId: string, newValue: string) {
    const rule = this.dependencyRules.find(r => r.id === ruleId);
    if (rule) {
      rule.triggerValue = newValue;
      this.emitChanges();
    }
  }

  updateRuleDescription(ruleId: string, newDescription: string) {
    const rule = this.dependencyRules.find(r => r.id === ruleId);
    if (rule) {
      rule.description = newDescription;
      rule.conditionalSchema.description = newDescription;
      this.emitChanges();
    }
  }

  onConditionalSchemaChange(ruleId: string, updatedSchema: SchemaProperty) {
    const rule = this.dependencyRules.find(r => r.id === ruleId);
    if (rule) {
      rule.conditionalSchema = { ...updatedSchema };
      rule.requiredProperties = updatedSchema.required ? Object.keys(updatedSchema.required) : [];
      this.emitChanges();
    }
  }

  private emitChanges() {
    const dependentSchemas: { [key: string]: SchemaProperty } = {};
    
    this.dependencyRules.forEach(rule => {
      const schema = this.buildSchemaFromRule(rule);
      dependentSchemas[rule.triggerProperty] = schema;
    });

    this.dependentSchemasChange.emit(dependentSchemas);
  }

  private buildSchemaFromRule(rule: DependencyRule): SchemaProperty {
    const baseSchema = { ...rule.conditionalSchema };

    // Create the base conditional structure for all rule types
    const conditionalSchema: SchemaProperty = {
      id: this.generateId(),
      name: `dependency_${rule.triggerProperty}`,
      type: PropertyType.OBJECT,
      title: rule.description || `Dependency on ${rule.triggerProperty}`,
      description: rule.description,
      required: false,
      validationRules: [],
      if: {
        id: this.generateId(),
        name: 'if_condition',
        type: PropertyType.OBJECT,
        title: 'Condition',
        description: '',
        required: false,
        validationRules: [],
        properties: {
          [rule.triggerProperty]: {
            id: this.generateId(),
            name: rule.triggerProperty,
            type: PropertyType.STRING,
            title: rule.triggerProperty,
            description: '',
            required: false,
            validationRules: []
          }
        }
      },
      then: baseSchema
    };

    // Apply the specific condition logic to the property
    const propertyCondition: any = conditionalSchema.if!.properties![rule.triggerProperty];
    
    switch (rule.triggerCondition) {
      case 'equals':
        if (rule.triggerValue !== undefined) {
          propertyCondition.const = this.parseValue(rule.triggerValue);
        }
        break;
      case 'not-equals':
        if (rule.triggerValue !== undefined) {
          propertyCondition.not = { const: this.parseValue(rule.triggerValue) };
        }
        break;
      case 'in-array':
        if (rule.triggerValue !== undefined) {
          propertyCondition.enum = rule.triggerValue.split(',').map((v: string) => this.parseValue(v.trim()));
        }
        break;
      case 'exists':
        // For existence check, the condition is handled in the conversion function
        // by setting the required array. No additional property constraints needed.
        break;
    }

    return conditionalSchema;
  }

  private parseValue(value: string): any {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // If parsing fails, check for common types
      if (value === 'true') return true;
      if (value === 'false') return false;
      if (/^\d+$/.test(value)) return parseInt(value, 10);
      if (/^\d*\.\d+$/.test(value)) return parseFloat(value);
      return value;
    }
  }

  getTriggerCondition(value: string) {
    return this.triggerConditions.find(c => c.value === value) || this.triggerConditions[0];
  }

  private resetNewRuleForm() {
    this.newRuleTriggerProperty = '';
    this.newRuleTriggerCondition = 'exists';
    this.newRuleTriggerValue = '';
    this.showAddRule = false;
  }

  toggleAddRule() {
    this.showAddRule = !this.showAddRule;
    if (!this.showAddRule) {
      this.resetNewRuleForm();
    }
  }

  startEditingRule(ruleId: string) {
    this.editingRuleId = ruleId;
  }

  stopEditingRule() {
    this.editingRuleId = null;
  }

  private generateId(): string {
    return 'dep_' + Math.random().toString(36).substr(2, 9);
  }

  getRuleDescription(rule: DependencyRule): string {
    const condition = this.getTriggerCondition(rule.triggerCondition);
    let desc = `When "${rule.triggerProperty}" ${condition.label.toLowerCase()}`;
    
    if (condition.needsValue && rule.triggerValue) {
      desc += ` "${rule.triggerValue}"`;
    }
    
    return desc;
  }
}