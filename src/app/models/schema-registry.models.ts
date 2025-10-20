// Schema Registry Models and Interfaces
// This file contains all TypeScript interfaces and types for Schema Registry integration

// Authentication configuration for Schema Registry
export interface RegistryAuthConfig {
  type: 'none' | 'basic' | 'apikey' | 'mtls';
  username?: string;
  password?: string;
  apiKey?: string;
  certPath?: string;
  keyPath?: string;
}

// Main Schema Registry configuration
export interface RegistryConfig {
  url: string;
  authentication: RegistryAuthConfig;
  defaultCompatibilityLevel: CompatibilityLevel;
  timeout?: number;
  retryAttempts?: number;
}

// Schema Registry compatibility levels
export type CompatibilityLevel = 
  | 'BACKWARD' 
  | 'BACKWARD_TRANSITIVE' 
  | 'FORWARD' 
  | 'FORWARD_TRANSITIVE' 
  | 'FULL' 
  | 'FULL_TRANSITIVE' 
  | 'NONE';

// Schema types supported by Schema Registry
export type SchemaType = 'AVRO' | 'JSON' | 'PROTOBUF';

// Subject information from Schema Registry
export interface Subject {
  name: string;
  versions: number[];
  compatibilityLevel?: CompatibilityLevel;
  schemaType: SchemaType;
  latestVersion?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Schema version information
export interface SchemaVersion {
  id: number;
  version: number;
  subject: string;
  schema: string; // JSON string representation
  schemaType: SchemaType;
  references?: SchemaReference[];
  createdAt?: Date;
  metadata?: SchemaMetadata;
}

// Schema reference for complex schemas
export interface SchemaReference {
  name: string;
  subject: string;
  version: number;
}

// Schema metadata for governance
export interface SchemaMetadata {
  tags?: { [key: string]: string };
  properties?: { [key: string]: string };
  sensitive?: string[];
  ruleSet?: RuleSet;
}

// Rule set for schema governance
export interface RuleSet {
  migrationRules?: MigrationRule[];
  domainRules?: DomainRule[];
}

export interface MigrationRule {
  name: string;
  kind: string;
  mode: string;
  type: string;
  tags?: string[];
  params?: { [key: string]: any };
}

export interface DomainRule {
  name: string;
  kind: string;
  type: string;
  mode: string;
  tags?: string[];
  params?: { [key: string]: any };
}

// Schema Registry API response types
export interface RegistryResponse<T = any> {
  data: T;
  status: number;
  message?: string;
}

export interface SchemaRegistrationResponse {
  id: number;
}

export interface CompatibilityCheckResponse {
  is_compatible: boolean;
  messages?: string[];
}

export interface SubjectVersionResponse {
  subject: string;
  id: number;
  version: number;
  schemaType: SchemaType;
  references: SchemaReference[];
  schema: string;
}

export interface SubjectConfigResponse {
  compatibilityLevel: CompatibilityLevel;
}

// Error types for Schema Registry operations
export interface RegistryError {
  error_code: number;
  message: string;
  details?: any;
}

export interface RegistryException extends Error {
  code: number;
  details?: any;
  response?: any;
}

// Connection status
export interface RegistryConnectionStatus {
  connected: boolean;
  url: string;
  version?: string;
  mode?: string;
  error?: string;
  lastChecked: Date;
}

// Schema evolution analysis types
export interface EvolutionAnalysis {
  isBackwardCompatible: boolean;
  isForwardCompatible: boolean;
  changes: SchemaChange[];
  migrationPath: MigrationStep[];
  riskAssessment: RiskAssessment;
}

export interface SchemaChange {
  type: SchemaChangeType;
  field: string;
  breaking: boolean;
  direction: 'forward' | 'backward' | 'both';
  description: string;
  impact: 'LOW' | 'MEDIUM' | 'HIGH';
  oldValue?: any;
  newValue?: any;
  path?: string;
}

export type SchemaChangeType = 
  | 'FIELD_ADDED'
  | 'FIELD_REMOVED'
  | 'FIELD_TYPE_CHANGED'
  | 'REQUIRED_FIELD_ADDED'
  | 'REQUIRED_FIELD_REMOVED'
  | 'CONSTRAINT_ADDED'
  | 'CONSTRAINT_REMOVED'
  | 'CONSTRAINT_RELAXED'
  | 'CONSTRAINT_TIGHTENED'
  | 'ENUM_VALUE_ADDED'
  | 'ENUM_VALUE_REMOVED'
  | 'DEFAULT_VALUE_CHANGED'
  | 'PROPERTY_ORDER_CHANGED'
  | 'SCHEMA_METADATA_CHANGED';

export interface MigrationStep {
  action: string;
  field: string;
  description: string;
  code?: string;
  automated: boolean;
  complexity: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface RiskAssessment {
  overallRisk: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  breakingChanges: number;
  affectedConsumers?: string[];
  recommendedActions: string[];
  rollbackPlan?: string[];
}

// Publishing configuration
export interface PublishConfig {
  subject: string;
  schema: any; // The actual JSON Schema object
  normalize?: boolean;
  metadata?: SchemaMetadata;
  references?: SchemaReference[];
  validateCompatibility?: boolean;
  compatibilityLevel?: CompatibilityLevel;
}

export interface PublishResult {
  success: boolean;
  schemaId?: number;
  version?: number;
  errors?: string[];
  warnings?: string[];
  compatibilityResult?: CompatibilityCheckResponse;
}

// Default configurations
export const DEFAULT_REGISTRY_CONFIG: Partial<RegistryConfig> = {
  timeout: 30000,
  retryAttempts: 3,
  defaultCompatibilityLevel: 'BACKWARD'
};

export const COMPATIBILITY_LEVELS: { value: CompatibilityLevel; label: string; description: string }[] = [
  {
    value: 'BACKWARD',
    label: 'Backward',
    description: 'New schema can read data written by previous schema'
  },
  {
    value: 'BACKWARD_TRANSITIVE',
    label: 'Backward Transitive',
    description: 'New schema can read data written by all previous schemas'
  },
  {
    value: 'FORWARD',
    label: 'Forward',
    description: 'Previous schema can read data written by new schema'
  },
  {
    value: 'FORWARD_TRANSITIVE',
    label: 'Forward Transitive',
    description: 'All previous schemas can read data written by new schema'
  },
  {
    value: 'FULL',
    label: 'Full',
    description: 'Both backward and forward compatible'
  },
  {
    value: 'FULL_TRANSITIVE',
    label: 'Full Transitive',
    description: 'Both backward and forward compatible with all versions'
  },
  {
    value: 'NONE',
    label: 'None',
    description: 'No compatibility checking'
  }
];

// Utility type guards
export function isRegistryError(obj: any): obj is RegistryError {
  return obj && typeof obj.error_code === 'number' && typeof obj.message === 'string';
}

export function isCompatibilityCheckResponse(obj: any): obj is CompatibilityCheckResponse {
  return obj && typeof obj.is_compatible === 'boolean';
}

export function isSchemaVersion(obj: any): obj is SchemaVersion {
  return obj && typeof obj.id === 'number' && typeof obj.version === 'number' && typeof obj.schema === 'string';
}