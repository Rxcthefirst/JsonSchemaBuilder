import { environment } from '../../environments/environment';

interface ProxyConfig {
  useProxy: boolean;
  directUrl?: string;
  proxyTarget?: string;
  lambdaProxyUrl?: string;
  corsEnabled?: boolean;
}

export const AMPLIFY_PROXY_CONFIG: Record<string, ProxyConfig> = {
  development: {
    // Use Angular proxy in development
    useProxy: true,
    proxyTarget: 'http://3.239.17.32:8081',
    corsEnabled: false
  },
  production: {
    // Direct connection in production
    useProxy: false,
    directUrl: 'https://3.239.17.32:8081', // Your schema registry URL
    lambdaProxyUrl: '', // Optional: Lambda proxy URL if needed
    corsEnabled: true
  }
};

export function getSchemaRegistryConfig() {
  const config = AMPLIFY_PROXY_CONFIG[environment.production ? 'production' : 'development'];
  return {
    url: environment.production ? (config.directUrl || environment.schemaRegistryUrl) : environment.schemaRegistryUrl,
    corsEnabled: config.corsEnabled || false
  };
}