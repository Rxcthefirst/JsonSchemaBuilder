export enum PropertyType {
  STRING = 'string',
  NUMBER = 'number',
  INTEGER = 'integer',
  BOOLEAN = 'boolean',
  ARRAY = 'array',
  OBJECT = 'object',
  NULL = 'null'
}

export interface ValidationRule {
  type: string;
  value: any;
  message?: string;
}

export interface SchemaProperty {
  id: string;
  name: string;
  type: PropertyType;
  title?: string;
  description?: string;
  required?: boolean;
  defaultValue?: any;
  validationRules: ValidationRule[];
  
  // Type-specific properties
  properties?: { [key: string]: SchemaProperty }; // For object type
  items?: SchemaProperty; // For array type
  enum?: any[]; // For enumeration values
  const?: any; // For constant values (Draft 6+)
  
  // Reference support
  $ref?: string; // For schema references
  
  // Nesting management
  nestingDepth?: number; // Track nesting depth for UX controls
  
  // String-specific
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  contentEncoding?: string; // Draft 7+
  contentMediaType?: string; // Draft 7+
  
  // Number/Integer-specific
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean; // boolean in Draft 4, number in Draft 6+
  exclusiveMaximum?: number | boolean; // boolean in Draft 4, number in Draft 6+
  multipleOf?: number;
  
  // Array-specific
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  contains?: SchemaProperty; // Draft 6+
  additionalItems?: boolean | SchemaProperty; // For tuple validation
  prefixItems?: SchemaProperty[]; // Draft 2020-12+
  unevaluatedItems?: boolean | SchemaProperty; // Draft 2020-12+
  
  // Object-specific
  minProperties?: number;
  maxProperties?: number;
  additionalProperties?: boolean | SchemaProperty;
  patternProperties?: { [pattern: string]: SchemaProperty };
  propertyNames?: SchemaProperty; // Draft 6+
  dependencies?: { [key: string]: string[] | SchemaProperty }; // Deprecated in Draft 2019-09
  dependentRequired?: { [key: string]: string[] }; // Draft 2019-09+
  dependentSchemas?: { [key: string]: SchemaProperty }; // Draft 2019-09+
  unevaluatedProperties?: boolean | SchemaProperty; // Draft 2020-12+
  
  // Conditional validation (Draft 7+)
  if?: SchemaProperty;
  then?: SchemaProperty;
  else?: SchemaProperty;
  
  // Composition keywords
  allOf?: (SchemaProperty | any)[]; // Allow raw objects for conditional schemas
  anyOf?: SchemaProperty[];
  oneOf?: SchemaProperty[];
  not?: SchemaProperty;
  
  // Annotations
  examples?: any[]; // Draft 6+
  comment?: string; // Draft 7+
  deprecated?: boolean; // Draft 7+
  readOnly?: boolean; // Draft 7+
  writeOnly?: boolean; // Draft 7+
}

export interface JsonSchema {
  $schema?: string;
  $id?: string; // Draft 06+
  id?: string; // Draft 04 only
  $ref?: string; // For schema references
  title?: string;
  description?: string;
  type?: PropertyType;
  properties?: { [key: string]: SchemaProperty };
  required?: string[];
  additionalProperties?: boolean | SchemaProperty;
  definitions?: { [key: string]: SchemaProperty };
  
  // Root-level validation properties
  enum?: any[];
  const?: any;
  
  // String constraints (when type is string)
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  format?: string;
  contentEncoding?: string;
  contentMediaType?: string;
  
  // Number constraints (when type is number/integer)
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number | boolean;
  exclusiveMaximum?: number | boolean;
  multipleOf?: number;
  
  // Array constraints (when type is array)
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  items?: SchemaProperty;
  additionalItems?: boolean | SchemaProperty;
  contains?: SchemaProperty;
  prefixItems?: SchemaProperty[];
  unevaluatedItems?: boolean | SchemaProperty;
  
  // Object constraints (when type is object)
  minProperties?: number;
  maxProperties?: number;
  patternProperties?: { [pattern: string]: SchemaProperty };
  propertyNames?: SchemaProperty;
  dependencies?: { [key: string]: string[] | SchemaProperty };
  dependentRequired?: { [key: string]: string[] };
  dependentSchemas?: { [key: string]: SchemaProperty };
  unevaluatedProperties?: boolean | SchemaProperty;
  
  // Conditional validation
  if?: SchemaProperty;
  then?: SchemaProperty;
  else?: SchemaProperty;
  
  // Composition keywords
  allOf?: (SchemaProperty | any)[]; // Allow raw objects for conditional schemas
  anyOf?: SchemaProperty[];
  oneOf?: SchemaProperty[];
  not?: SchemaProperty;
  
  // Annotations
  examples?: any[];
  comment?: string;
  deprecated?: boolean;
  readOnly?: boolean;
  writeOnly?: boolean;
  
  // Default value
  default?: any;
}

export interface SchemaConfiguration {
  useReferences: boolean; // Enable $ref pattern generation
  generateDefinitions: boolean; // Auto-generate definitions section
  draftVersion: string; // JSON Schema draft version
}

export interface SchemaFormData {
  title: string;
  description: string;
  version: string;
  properties: SchemaProperty[];
  requiredProperties: string[];
}

// Draft-specific format support
export const DEFAULT_STRING_FORMATS = {
  'draft-04': [
    'date-time', 'email', 'hostname', 'ipv4', 'ipv6', 'uri'
  ],
  'draft-06': [
    'date-time', 'email', 'hostname', 'ipv4', 'ipv6', 'uri', 'uri-reference'
  ],
  'draft-07': [
    'date-time', 'date', 'time', 'email', 'hostname', 'ipv4', 'ipv6', 'uri', 'uri-reference', 'uri-template', 'json-pointer', 'relative-json-pointer', 'regex'
  ],
  'draft-2019-09': [
    'date-time', 'date', 'time', 'duration', 'email', 'idn-email', 'hostname', 'idn-hostname', 'ipv4', 'ipv6', 'uri', 'uri-reference', 'iri', 'iri-reference', 'uuid', 'uri-template', 'json-pointer', 'relative-json-pointer', 'regex'
  ],
  'draft-2020-12': [
    'date-time', 'date', 'time', 'duration', 'email', 'idn-email', 'hostname', 'idn-hostname', 'ipv4', 'ipv6', 'uri', 'uri-reference', 'iri', 'iri-reference', 'uuid', 'uri-template', 'json-pointer', 'relative-json-pointer', 'regex'
  ]
};

// Content encoding types (Draft 7+)
export const CONTENT_ENCODINGS = [
  'base64', 'base64url', 'quoted-printable', '8bit', '7bit', 'binary'
];

// Content media types (Draft 7+)
export const CONTENT_MEDIA_TYPES = [
  'application/json', 'text/html', 'text/plain', 'image/png', 'image/jpeg', 'application/pdf'
];

// Draft capabilities mapping
export const DRAFT_FEATURES = {
  'draft-04': {
    exclusiveMinimum: 'boolean',
    exclusiveMaximum: 'boolean',
    idField: 'id', // Draft 04 uses 'id'
    supports: ['enum', 'dependencies']
  },
  'draft-06': {
    exclusiveMinimum: 'number',
    exclusiveMaximum: 'number',
    idField: '$id', // Draft 06+ uses '$id'
    supports: ['enum', 'const', 'contains', 'propertyNames', 'dependencies', 'examples']
  },
  'draft-07': {
    exclusiveMinimum: 'number',
    exclusiveMaximum: 'number',
    idField: '$id', // Draft 07+ uses '$id'
    supports: ['enum', 'const', 'contains', 'propertyNames', 'dependencies', 'examples', 'if', 'then', 'else', 'contentEncoding', 'contentMediaType', 'comment', 'deprecated', 'readOnly', 'writeOnly']
  },
  'draft-2019-09': {
    exclusiveMinimum: 'number', 
    exclusiveMaximum: 'number',
    idField: '$id', // Draft 2019-09+ uses '$id'
    supports: ['enum', 'const', 'contains', 'propertyNames', 'dependentRequired', 'dependentSchemas', 'examples', 'if', 'then', 'else', 'contentEncoding', 'contentMediaType', 'comment', 'deprecated', 'readOnly', 'writeOnly']
  },
  'draft-2020-12': {
    exclusiveMinimum: 'number',
    exclusiveMaximum: 'number',
    idField: '$id', // Draft 2020-12+ uses '$id'
    supports: ['enum', 'const', 'contains', 'propertyNames', 'dependentRequired', 'dependentSchemas', 'examples', 'if', 'then', 'else', 'contentEncoding', 'contentMediaType', 'comment', 'deprecated', 'readOnly', 'writeOnly', 'prefixItems', 'unevaluatedItems', 'unevaluatedProperties']
  }
};

// Utility function to get correct ID field name for draft
export function getIdFieldForDraft(draft: string): 'id' | '$id' {
  return DRAFT_FEATURES[draft as keyof typeof DRAFT_FEATURES]?.idField as 'id' | '$id' || '$id';
}

export const VALIDATION_RULE_TYPES = {
  [PropertyType.STRING]: ['minLength', 'maxLength', 'pattern', 'format', 'enum'],
  [PropertyType.NUMBER]: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'enum'],
  [PropertyType.INTEGER]: ['minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum', 'multipleOf', 'enum'],
  [PropertyType.BOOLEAN]: ['enum'],
  [PropertyType.ARRAY]: ['minItems', 'maxItems', 'uniqueItems'],
  [PropertyType.OBJECT]: ['minProperties', 'maxProperties', 'additionalProperties'],
  [PropertyType.NULL]: []
};

// Nesting configuration constants - removed artificial limits

export const DEFAULT_SCHEMA_CONFIG: SchemaConfiguration = {
  useReferences: false,
  generateDefinitions: true,
  draftVersion: 'https://json-schema.org/draft/2020-12/schema'
};

// Map JSON Schema draft versions to Monaco validation URIs
export const DRAFT_VERSION_MAP = {
  'https://json-schema.org/draft-04/schema': 'http://json-schema.org/draft-04/schema#',
  'https://json-schema.org/draft-06/schema': 'http://json-schema.org/draft-06/schema#', 
  'https://json-schema.org/draft-07/schema': 'http://json-schema.org/draft-07/schema#',
  'https://json-schema.org/draft/2019-09/schema': 'http://json-schema.org/draft-07/schema#', // Monaco fallback
  'https://json-schema.org/draft/2020-12/schema': 'http://json-schema.org/draft-07/schema#'  // Monaco fallback
};