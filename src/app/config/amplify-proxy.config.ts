import { environment } from '../../environments/environment';

// Simplified configuration - no proxy needed, direct CloudFront endpoint
export const SCHEMA_REGISTRY_CONFIG = {
  url: 'https://d3ej5qtqlefebd.cloudfront.net',
  corsEnabled: true
};

export function getSchemaRegistryConfig() {
  return {
    url: environment.schemaRegistryUrl,
    corsEnabled: environment.corsEnabled || true
  };
}