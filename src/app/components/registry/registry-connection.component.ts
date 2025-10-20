import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchemaRegistryService } from '../../services/registry/schema-registry.service.js';
import { RegistryClientService } from '../../services/registry/registry-client.service.js';
import {
  RegistryConfig,
  RegistryConnectionStatus,
  Subject
} from '../../models/schema-registry.models.js';

@Component({
  selector: 'app-registry-connection',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="registry-connection-panel">
      <h3>Schema Registry Connection</h3>
      
      <!-- Connection Configuration -->
      <div class="connection-config" *ngIf="!connectionStatus.connected">
        <h4>Connect to Schema Registry</h4>
        <div class="form-group">
          <label for="registryUrl">Registry URL:</label>
          <input 
            id="registryUrl"
            type="text" 
            [(ngModel)]="config.url" 
            placeholder="/api/schema-registry"
            class="form-control">
        </div>
        
        <div class="form-group">
          <label for="authType">Authentication:</label>
          <select id="authType" [(ngModel)]="config.authentication.type" class="form-control">
            <option value="none">None</option>
            <option value="basic">Basic Auth</option>
            <option value="apikey">API Key</option>
          </select>
        </div>
        
        <div class="form-group" *ngIf="config.authentication.type === 'basic'">
          <label for="username">Username:</label>
          <input 
            id="username"
            type="text" 
            [(ngModel)]="config.authentication.username" 
            class="form-control">
          <label for="password">Password:</label>
          <input 
            id="password"
            type="password" 
            [(ngModel)]="config.authentication.password" 
            class="form-control">
        </div>
        
        <div class="form-group" *ngIf="config.authentication.type === 'apikey'">
          <label for="apikey">API Key:</label>
          <input 
            id="apikey"
            type="text" 
            [(ngModel)]="config.authentication.apiKey" 
            class="form-control">
        </div>
        
        <button 
          (click)="connect()" 
          [disabled]="connecting"
          class="btn btn-primary">
          {{ connecting ? 'Connecting...' : 'Connect' }}
        </button>
      </div>
      
      <!-- Connection Status -->
      <div class="connection-status" *ngIf="connectionStatus.connected">
        <div class="status-success">
          <h4>✅ Connected to Schema Registry</h4>
          <p><strong>URL:</strong> {{ connectionStatus.url }}</p>
          <p><strong>Version:</strong> {{ connectionStatus.version || 'Unknown' }}</p>
          <p><strong>Mode:</strong> {{ connectionStatus.mode || 'Unknown' }}</p>
          <p><strong>Last Checked:</strong> {{ connectionStatus.lastChecked | date:'medium' }}</p>
        </div>
        
        <button (click)="disconnect()" class="btn btn-secondary">Disconnect</button>
        <button (click)="testConnection()" class="btn btn-outline-primary">Test Connection</button>
      </div>
      
      <!-- Error Display -->
      <div class="connection-error" *ngIf="connectionStatus.error">
        <div class="alert alert-danger">
          <strong>Connection Error:</strong> {{ connectionStatus.error }}
        </div>
      </div>
      
      <!-- Registry Health -->
      <div class="registry-health" *ngIf="connectionStatus.connected && health">
        <h4>Registry Health</h4>
        <div class="health-metrics">
          <div class="metric">
            <span class="label">Total Subjects:</span>
            <span class="value">{{ health.subjectCount }}</span>
          </div>
          <div class="metric">
            <span class="label">Status:</span>
            <span class="value" [class.success]="health.connected" [class.error]="!health.connected">
              {{ health.connected ? 'Healthy' : 'Unhealthy' }}
            </span>
          </div>
        </div>
      </div>
      
      <!-- Quick Subject List -->
      <div class="subjects-preview" *ngIf="connectionStatus.connected && subjects.length > 0">
        <h4>Available Subjects</h4>
        <div class="subjects-list">
          <div 
            class="subject-item" 
            *ngFor="let subject of subjects.slice(0, 5)"
            (click)="selectSubject(subject)">
            <span class="subject-name">{{ subject.name }}</span>
            <span class="version-count">{{ subject.versions.length || 0 }} versions</span>
          </div>
          <div *ngIf="subjects.length > 5" class="more-subjects">
            ... and {{ subjects.length - 5 }} more subjects
          </div>
        </div>
      </div>
      
      <!-- Selected Subject Details -->
      <div class="subject-details" *ngIf="selectedSubject">
        <h4>Subject: {{ selectedSubject.name }}</h4>
        <div class="subject-info">
          <p><strong>Latest Version:</strong> {{ selectedSubject.latestVersion }}</p>
          <p><strong>Total Versions:</strong> {{ selectedSubject.versions.length }}</p>
          <p><strong>Schema Type:</strong> {{ selectedSubject.schemaType }}</p>
          
          <div *ngIf="selectedSubject.evolutionSummary" class="evolution-summary">
            <h5>Evolution Summary</h5>
            <div class="evolution-metrics">
              <div class="metric">
                <span class="label">Total Changes:</span>
                <span class="value">{{ selectedSubject.evolutionSummary.totalChanges }}</span>
              </div>
              <div class="metric">
                <span class="label">Breaking Changes:</span>
                <span class="value breaking" *ngIf="selectedSubject.evolutionSummary.breakingChanges > 0">
                  {{ selectedSubject.evolutionSummary.breakingChanges }}
                </span>
                <span class="value safe" *ngIf="selectedSubject.evolutionSummary.breakingChanges === 0">
                  0
                </span>
              </div>
              <div class="metric">
                <span class="label">Risk Level:</span>
                <span 
                  class="value"
                  [class]="'risk-' + selectedSubject.evolutionSummary.riskLevel?.toLowerCase()">
                  {{ selectedSubject.evolutionSummary.riskLevel }}
                </span>
              </div>
            </div>
          </div>
        </div>
        
        <button (click)="clearSelection()" class="btn btn-sm btn-outline-secondary">
          Clear Selection
        </button>
      </div>
    </div>
  `,
  styles: [`
    .registry-connection-panel {
      background: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 8px;
      padding: 20px;
      margin: 10px 0;
    }
    
    .form-group {
      margin-bottom: 15px;
    }
    
    .form-group label {
      display: block;
      margin-bottom: 5px;
      font-weight: 500;
    }
    
    .form-control {
      width: 100%;
      padding: 8px 12px;
      border: 1px solid #ccc;
      border-radius: 4px;
      font-size: 14px;
    }
    
    .btn {
      padding: 8px 16px;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 14px;
      margin-right: 10px;
    }
    
    .btn-primary {
      background: #007bff;
      color: white;
    }
    
    .btn-primary:hover {
      background: #0056b3;
    }
    
    .btn-primary:disabled {
      background: #6c757d;
      cursor: not-allowed;
    }
    
    .btn-secondary {
      background: #6c757d;
      color: white;
    }
    
    .btn-outline-primary {
      background: transparent;
      color: #007bff;
      border: 1px solid #007bff;
    }
    
    .btn-outline-secondary {
      background: transparent;
      color: #6c757d;
      border: 1px solid #6c757d;
    }
    
    .status-success {
      background: #d4edda;
      border: 1px solid #c3e6cb;
      color: #155724;
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 15px;
    }
    
    .alert {
      padding: 15px;
      border-radius: 4px;
      margin-bottom: 15px;
    }
    
    .alert-danger {
      background: #f8d7da;
      border: 1px solid #f5c6cb;
      color: #721c24;
    }
    
    .health-metrics, .evolution-metrics {
      display: flex;
      gap: 20px;
      flex-wrap: wrap;
    }
    
    .metric {
      display: flex;
      flex-direction: column;
      min-width: 120px;
    }
    
    .metric .label {
      font-size: 12px;
      color: #666;
      margin-bottom: 4px;
    }
    
    .metric .value {
      font-weight: bold;
      font-size: 16px;
    }
    
    .value.success {
      color: #28a745;
    }
    
    .value.error {
      color: #dc3545;
    }
    
    .value.breaking {
      color: #dc3545;
    }
    
    .value.safe {
      color: #28a745;
    }
    
    .risk-low {
      color: #28a745;
    }
    
    .risk-medium {
      color: #ffc107;
    }
    
    .risk-high {
      color: #fd7e14;
    }
    
    .risk-critical {
      color: #dc3545;
    }
    
    .subjects-list {
      max-height: 200px;
      overflow-y: auto;
      border: 1px solid #dee2e6;
      border-radius: 4px;
    }
    
    .subject-item {
      display: flex;
      justify-content: space-between;
      padding: 10px;
      border-bottom: 1px solid #eee;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    
    .subject-item:hover {
      background-color: #f8f9fa;
    }
    
    .subject-item:last-child {
      border-bottom: none;
    }
    
    .subject-name {
      font-weight: 500;
    }
    
    .version-count {
      color: #666;
      font-size: 12px;
    }
    
    .more-subjects {
      padding: 10px;
      text-align: center;
      color: #666;
      font-style: italic;
    }
    
    .subject-details {
      background: white;
      border: 1px solid #dee2e6;
      border-radius: 4px;
      padding: 15px;
      margin-top: 15px;
    }
    
    .evolution-summary {
      background: #f8f9fa;
      border-radius: 4px;
      padding: 10px;
      margin-top: 10px;
    }
    
    h3, h4, h5 {
      margin-top: 0;
      margin-bottom: 15px;
      color: #333;
    }
    
    h4 {
      font-size: 18px;
    }
    
    h5 {
      font-size: 14px;
      margin-bottom: 10px;
    }
  `]
})
export class RegistryConnectionComponent implements OnInit {
  config: RegistryConfig = {
    url: '/api/schema-registry',
    authentication: {
      type: 'none'
    },
    defaultCompatibilityLevel: 'BACKWARD'
  };
  
  connectionStatus: RegistryConnectionStatus = {
    connected: false,
    url: '',
    lastChecked: new Date()
  };
  
  connecting = false;
  subjects: (Subject & { evolutionSummary?: any })[] = [];
  selectedSubject: (Subject & { evolutionSummary?: any }) | null = null;
  health: any = null;
  private hasLoadedSubjects = false; // Prevent multiple loads

  constructor(
    private registryService: SchemaRegistryService,
    private clientService: RegistryClientService
  ) {}

  ngOnInit() {
    // Expose service for browser console testing
    (window as any).schemaRegistryService = this.registryService;
    console.log('SchemaRegistryService exposed as window.schemaRegistryService');
    console.log('Call window.schemaRegistryService.testDirectCall() to test HTTP calls');
    
    // NO automatic subscriptions or reactive behavior
    // Everything is manual and explicit
  }

  connect() {
    this.connecting = true;
    
    // Configure the service
    this.registryService.configure(this.config);
    
    // Test connection ONCE
    this.registryService.testConnection().subscribe({
      next: (status: RegistryConnectionStatus) => {
        this.connectionStatus = status;
        this.connecting = false;
        
        if (status.connected) {
          console.log('✅ Connected to Schema Registry');
          // Load subjects ONCE after successful connection
          this.loadSubjectsOnce();
        } else {
          console.log('❌ Failed to connect to Schema Registry');
        }
      },
      error: (error: any) => {
        console.error('Connection error:', error);
        this.connectionStatus = {
          connected: false,
          url: this.config.url,
          error: error.message,
          lastChecked: new Date()
        };
        this.connecting = false;
      }
    });
  }

  disconnect() {
    console.log('Disconnecting from Schema Registry');
    this.connectionStatus = {
      connected: false,
      url: '',
      lastChecked: new Date()
    };
    this.subjects = [];
    this.selectedSubject = null;
    this.health = null;
    this.hasLoadedSubjects = false;
  }

  // Load subjects ONCE - no subscriptions, no reactive behavior
  loadSubjectsOnce() {
    console.log('Loading subjects (one time only)...');
    
    this.registryService.getSubjects().subscribe({
      next: (subjectNames: string[]) => {
        console.log(`Found ${subjectNames.length} subjects`);
        
        // Just store the basic subject names - no complex loading
        this.subjects = subjectNames.slice(0, 5).map(name => ({
          name,
          versions: [],
          schemaType: 'JSON' as const
        }));
        
        console.log('✅ Subjects loaded');
      },
      error: (error: any) => {
        console.error('❌ Failed to load subjects:', error);
      }
    });
  }

  loadSubjects() {
    this.registryService.getSubjects().subscribe({
      next: (subjectNames: string[]) => {
        // Load detailed information for each subject (limit to first 5 for performance)
        const limitedSubjects = subjectNames.slice(0, 5);
        
        // Process subjects one at a time with a delay to avoid overwhelming the server
        this.loadSubjectsSequentially(limitedSubjects, 0);
      },
      error: (error: any) => {
        console.error('Failed to load subjects:', error);
      }
    });
  }

  private loadSubjectsSequentially(subjectNames: string[], index: number) {
    if (index >= subjectNames.length) {
      return; // Done processing all subjects
    }

    const name = subjectNames[index];
    
    this.clientService.getSubjectWithEvolution(name).subscribe({
      next: (subject) => {
        const existingIndex = this.subjects.findIndex(s => s.name === subject.name);
        if (existingIndex >= 0) {
          this.subjects[existingIndex] = subject;
        } else {
          this.subjects.push(subject);
        }
        
        // Process next subject after a small delay
        setTimeout(() => {
          this.loadSubjectsSequentially(subjectNames, index + 1);
        }, 200); // 200ms delay between requests
      },
      error: (error) => {
        console.error(`Failed to load subject ${name}:`, error);
        // Add basic subject info even if evolution analysis fails
        this.subjects.push({
          name,
          versions: [],
          schemaType: 'JSON'
        });
        
        // Continue with next subject even if this one failed
        setTimeout(() => {
          this.loadSubjectsSequentially(subjectNames, index + 1);
        }, 200);
      }
    });
  }

  loadHealth() {
    this.clientService.getRegistryHealth().subscribe({
      next: (health) => {
        this.health = health;
      },
      error: (error) => {
        console.error('Failed to load registry health:', error);
      }
    });
  }

  // Simple test connection method for UI button
  testConnection() {
    console.log('Testing connection...');
    this.registryService.testConnection().subscribe({
      next: (status: RegistryConnectionStatus) => {
        this.connectionStatus = status;
        console.log('Test result:', status.connected ? '✅ Connected' : '❌ Failed');
      },
      error: (error: any) => {
        console.error('❌ Test failed:', error);
      }
    });
  }

  selectSubject(subject: Subject & { evolutionSummary?: any }) {
    this.selectedSubject = subject;
  }

  clearSelection() {
    this.selectedSubject = null;
  }
}