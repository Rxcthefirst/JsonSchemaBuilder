import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, of, timer } from 'rxjs';
import { environment } from '../../../environments/environment';
import { map, catchError, retry, retryWhen, delayWhen, take, timeout, switchMap } from 'rxjs/operators';
import {
  RegistryConfig,
  RegistryConnectionStatus,
  Subject,
  SchemaVersion,
  CompatibilityLevel,
  SchemaRegistrationResponse,
  CompatibilityCheckResponse,
  SubjectVersionResponse,
  SubjectConfigResponse,
  RegistryError,
  RegistryException,
  PublishConfig,
  PublishResult,
  DEFAULT_REGISTRY_CONFIG,
  isRegistryError
} from '../../models/schema-registry.models.js';
import { JsonSchema } from '../../models/schema.models.js';

@Injectable({
  providedIn: 'root'
})
export class SchemaRegistryService {
  private configSubject = new BehaviorSubject<RegistryConfig | null>(null);
  private connectionStatusSubject = new BehaviorSubject<RegistryConnectionStatus>({
    connected: false,
    url: '',
    lastChecked: new Date()
  });

  public config$ = this.configSubject.asObservable();
  public connectionStatus$ = this.connectionStatusSubject.asObservable();

  constructor(private http: HttpClient) {
    // Initialize with localhost configuration for development
    this.initializeDefaultConfig();
  }

  /**
   * Initialize with environment-specific configuration
   */
  private initializeDefaultConfig(): void {
    const defaultConfig: RegistryConfig = {
      url: environment.schemaRegistryUrl,
      authentication: {
        type: 'none'
      },
      defaultCompatibilityLevel: 'BACKWARD',
      timeout: 10000, // Reduced from 30000
      retryAttempts: 1 // Reduced from 3
    };
    
    this.configSubject.next(defaultConfig);
  }

  /**
   * Configure the Schema Registry connection
   */
  configure(config: RegistryConfig): void {
    const fullConfig = { ...DEFAULT_REGISTRY_CONFIG, ...config };
    this.configSubject.next(fullConfig);
    // Don't automatically test connection - let the caller decide when to test
  }

  /**
   * Get current configuration
   */
  getConfig(): RegistryConfig | null {
    return this.configSubject.value;
  }

  /**
   * Test connection to Schema Registry
   */
  testConnection(): Observable<RegistryConnectionStatus> {
    const config = this.configSubject.value;
    if (!config) {
      const status: RegistryConnectionStatus = {
        connected: false,
        url: '',
        error: 'No configuration provided',
        lastChecked: new Date()
      };
      this.connectionStatusSubject.next(status);
      return of(status);
    }

    return this.http.get(this.buildUrl(config.url, '/'), { 
      headers: this.buildHeaders()
    }).pipe(
      timeout(config.timeout || 30000),
      map((response: any) => {
        const status: RegistryConnectionStatus = {
          connected: true,
          url: config.url,
          version: response.version,
          mode: response.mode,
          lastChecked: new Date()
        };
        this.connectionStatusSubject.next(status);
        return status;
      }),
      catchError((error: HttpErrorResponse) => {
        const status: RegistryConnectionStatus = {
          connected: false,
          url: config.url,
          error: this.extractErrorMessage(error),
          lastChecked: new Date()
        };
        this.connectionStatusSubject.next(status);
        return of(status);
      })
    );
  }

  /**
   * Get all subjects from Schema Registry
   */
  getSubjects(): Observable<string[]> {
    return this.makeRequest<string[]>('/subjects');
  }

  /**
   * Get detailed subject information
   */
  getSubjectDetails(subjectName: string): Observable<Subject> {
    return this.getSubjectVersions(subjectName).pipe(
      map((versions: number[]) => {
        const subject: Subject = {
          name: subjectName,
          versions,
          schemaType: 'JSON', // We're focusing on JSON schemas
          latestVersion: versions.length > 0 ? Math.max(...versions) : undefined
        };
        return subject;
      })
    );
  }

  /**
   * Get versions for a subject
   */
  getSubjectVersions(subjectName: string): Observable<number[]> {
    return this.makeRequest<number[]>(`/subjects/${encodeURIComponent(subjectName)}/versions`);
  }

  /**
   * Get specific schema version
   */
  getSchemaVersion(subjectName: string, version: number | 'latest' = 'latest'): Observable<SchemaVersion> {
    return this.makeRequest<SubjectVersionResponse>(
      `/subjects/${encodeURIComponent(subjectName)}/versions/${version}`
    ).pipe(
      map((response: SubjectVersionResponse) => ({
        id: response.id,
        version: response.version,
        subject: response.subject,
        schema: response.schema,
        schemaType: response.schemaType,
        references: response.references || [],
        createdAt: new Date() // Schema Registry doesn't provide creation date by default
      }))
    );
  }

  /**
   * Register a new JSON Schema
   */
  registerJsonSchema(config: PublishConfig): Observable<PublishResult> {
    const payload = {
      schemaType: 'JSON',
      schema: JSON.stringify(config.schema),
      references: config.references || [],
      metadata: config.metadata
    };

    // First check compatibility if requested
    if (config.validateCompatibility) {
      return this.checkCompatibility(config.subject, config.schema).pipe(
        switchMap((compatibilityResult: CompatibilityCheckResponse) => {
          if (!compatibilityResult.is_compatible) {
            return of({
              success: false,
              errors: compatibilityResult.messages || ['Schema is not compatible'],
              compatibilityResult
            });
          }
          
          // If compatible, proceed with registration
          return this.performRegistration(config.subject, payload);
        }),
        catchError(error => of({
          success: false,
          errors: [this.extractErrorMessage(error)]
        }))
      );
    }

    return this.performRegistration(config.subject, payload);
  }

  /**
   * Perform the actual schema registration
   */
  private performRegistration(subject: string, payload: any): Observable<PublishResult> {
    return this.makeRequest<SchemaRegistrationResponse>(
      `/subjects/${encodeURIComponent(subject)}/versions`,
      'POST',
      payload
    ).pipe(
      map((response: SchemaRegistrationResponse) => ({
        success: true,
        schemaId: response.id,
        version: undefined // Registry doesn't return version in registration response
      })),
      catchError(error => of({
        success: false,
        errors: [this.extractErrorMessage(error)]
      }))
    );
  }

  /**
   * Check schema compatibility
   */
  checkCompatibility(subjectName: string, schema: JsonSchema, version: number | 'latest' = 'latest'): Observable<CompatibilityCheckResponse> {
    const payload = {
      schemaType: 'JSON',
      schema: JSON.stringify(schema)
    };

    return this.makeRequest<CompatibilityCheckResponse>(
      `/compatibility/subjects/${encodeURIComponent(subjectName)}/versions/${version}`,
      'POST',
      payload
    );
  }

  /**
   * Get subject compatibility level
   */
  getSubjectCompatibility(subjectName: string): Observable<CompatibilityLevel> {
    return this.makeRequest<SubjectConfigResponse>(
      `/config/${encodeURIComponent(subjectName)}`
    ).pipe(
      map(response => response.compatibilityLevel)
    );
  }

  /**
   * Set subject compatibility level
   */
  setSubjectCompatibility(subjectName: string, level: CompatibilityLevel): Observable<CompatibilityLevel> {
    const payload = { compatibility: level };
    
    return this.makeRequest<SubjectConfigResponse>(
      `/config/${encodeURIComponent(subjectName)}`,
      'PUT',
      payload
    ).pipe(
      map(response => response.compatibilityLevel)
    );
  }

  /**
   * Delete a subject (all versions)
   */
  deleteSubject(subjectName: string, permanent: boolean = false): Observable<number[]> {
    const url = `/subjects/${encodeURIComponent(subjectName)}${permanent ? '?permanent=true' : ''}`;
    return this.makeRequest<number[]>(url, 'DELETE');
  }

  /**
   * Delete a specific schema version
   */
  deleteSchemaVersion(subjectName: string, version: number, permanent: boolean = false): Observable<number> {
    const url = `/subjects/${encodeURIComponent(subjectName)}/versions/${version}${permanent ? '?permanent=true' : ''}`;
    return this.makeRequest<number>(url, 'DELETE');
  }

  /**
   * Generic HTTP request method with error handling
   */
  private makeRequest<T>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET', 
    body?: any
  ): Observable<T> {
    const config = this.configSubject.value;
    if (!config) {
      return throwError(() => new Error('Schema Registry not configured'));
    }

    const url = this.buildUrl(config.url, endpoint);
    const headers = this.buildHeaders();
    
    let request: Observable<T>;
    
    switch (method) {
      case 'GET':
        request = this.http.get<T>(url, { headers });
        break;
      case 'POST':
        request = this.http.post<T>(url, body, { headers });
        break;
      case 'PUT':
        request = this.http.put<T>(url, body, { headers });
        break;
      case 'DELETE':
        request = this.http.delete<T>(url, { headers });
        break;
    }

    return request.pipe(
      timeout(config.timeout || 10000),
      retryWhen(errors => 
        errors.pipe(
          delayWhen(() => timer(2000)), // Increased delay between retries
          take(config.retryAttempts || 1) // Use the reduced retry attempts
        )
      ),
      catchError(this.handleError)
    );
  }

  /**
   * Build URL properly handling trailing slashes
   */
  private buildUrl(baseUrl: string, endpoint: string): string {
    // Remove trailing slash from base URL if present
    const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    // Ensure endpoint starts with /
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${cleanBaseUrl}${cleanEndpoint}`;
  }

  /**
   * Build HTTP headers for requests
   */
  private buildHeaders(): HttpHeaders {
    const config = this.configSubject.value;
    let headers = new HttpHeaders({
      'Content-Type': 'application/vnd.schemaregistry.v1+json',
      'Accept': 'application/vnd.schemaregistry.v1+json, application/vnd.schemaregistry+json, application/json'
    });

    if (config?.authentication) {
      switch (config.authentication.type) {
        case 'basic':
          if (config.authentication.username && config.authentication.password) {
            const credentials = btoa(`${config.authentication.username}:${config.authentication.password}`);
            headers = headers.set('Authorization', `Basic ${credentials}`);
          }
          break;
        case 'apikey':
          if (config.authentication.apiKey) {
            headers = headers.set('Authorization', `Bearer ${config.authentication.apiKey}`);
          }
          break;
      }
    }

    return headers;
  }

  /**
   * Handle HTTP errors
   */
  private handleError = (error: HttpErrorResponse): Observable<never> => {
    let errorMessage: string;
    let errorCode: number = 0;

    if (error.error && isRegistryError(error.error)) {
      errorMessage = error.error.message;
      errorCode = error.error.error_code;
    } else if (error.status === 0) {
      errorMessage = 'Unable to connect to Schema Registry. Please check the URL and network connection.';
    } else {
      errorMessage = error.message || 'An unknown error occurred';
    }

    const registryException: RegistryException = new Error(errorMessage) as RegistryException;
    registryException.code = errorCode;
    registryException.response = error;

    return throwError(() => registryException);
  };

  /**
   * Extract error message from various error types
   */
  private extractErrorMessage(error: any): string {
    if (error?.error && isRegistryError(error.error)) {
      return error.error.message;
    }
    if (error?.message) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'An unknown error occurred';
  }

  /**
   * Check if currently connected to Schema Registry
   */
  isConnected(): boolean {
    return this.connectionStatusSubject.value.connected;
  }

  /**
   * Get current connection status
   */
  getConnectionStatus(): RegistryConnectionStatus {
    return this.connectionStatusSubject.value;
  }

  /**
   * Test direct HTTP call to Schema Registry (for debugging)
   */
  testDirectCall(): void {
    const config = this.configSubject.value;
    if (!config) {
      console.error('Schema Registry not configured');
      return;
    }

    console.log('Testing direct HTTP call to Schema Registry...');
    console.log('Config URL:', config.url);

    // Test root endpoint
    const rootUrl = this.buildUrl(config.url, '/');
    console.log('Testing root endpoint:', rootUrl);
    
    this.http.get(rootUrl, { headers: this.buildHeaders() }).subscribe({
      next: (response) => {
        console.log('✅ Root endpoint SUCCESS:', response);
      },
      error: (error) => {
        console.error('❌ Root endpoint ERROR:', error);
      }
    });

    // Test subjects endpoint
    const subjectsUrl = this.buildUrl(config.url, '/subjects');
    console.log('Testing subjects endpoint:', subjectsUrl);
    
    this.http.get(subjectsUrl, { headers: this.buildHeaders() }).subscribe({
      next: (response) => {
        console.log('✅ Subjects endpoint SUCCESS:', response);
      },
      error: (error) => {
        console.error('❌ Subjects endpoint ERROR:', error);
      }
    });
  }
}