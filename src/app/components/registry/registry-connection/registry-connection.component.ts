import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SchemaRegistryService } from '../../../services/registry/schema-registry.service.js';
import { RegistryClientService } from '../../../services/registry/registry-client.service.js';
import {
  RegistryConfig,
  RegistryConnectionStatus,
  Subject
} from '../../../models/schema-registry.models.js';

@Component({
  selector: 'app-registry-connection',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl:  './registry-connection.component.html',
  styleUrl: './registry-connection.component.scss'
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