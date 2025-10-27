import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject as RxSubject, BehaviorSubject, debounceTime, distinctUntilChanged, switchMap, takeUntil, combineLatest, map } from 'rxjs';

import { SchemaRegistryService } from '../../../services/registry/schema-registry.service';
import { RegistryClientService } from '../../../services/registry/registry-client.service';
import { Subject as RegistrySubject, SchemaVersion, CompatibilityLevel, detectSchemaType } from '../../../models/schema-registry.models';

interface SubjectWithMetadata {
  name: string;
  latestVersion: number;
  totalVersions: number;
  compatibility: CompatibilityLevel;
  lastModified: string;
  schemaType: string;
}

@Component({
  selector: 'app-subject-browser',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './subject-browser.component.html',
  styleUrl: './subject-browser.component.scss'    
})
export class SubjectBrowserComponent implements OnInit, OnDestroy {
  private destroy$ = new RxSubject<void>();
  private searchSubject = new BehaviorSubject<string>('');

  // Component state
  subjects: SubjectWithMetadata[] = [];
  filteredSubjects: SubjectWithMetadata[] = [];
  loading = false;
  error: string | null = null;
  isConnected = false;

  // Search and filter state
  searchTerm = '';
  selectedCompatibility = '';
  selectedType = '';
  viewMode: 'grid' | 'list' = 'grid';

  constructor(
    private schemaRegistry: SchemaRegistryService,
    private registryClient: RegistryClientService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.setupSearch();
    this.checkConnection();
    this.loadSubjects();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  private setupSearch(): void {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        takeUntil(this.destroy$)
      )
      .subscribe(searchTerm => {
        this.applyFilters();
      });
  }

  private async checkConnection(): Promise<void> {
    try {
      const status = await this.schemaRegistry.testConnection().toPromise();
      this.isConnected = status?.connected || false;
    } catch (error) {
      this.isConnected = false;
      console.error('Registry connection check failed:', error);
    }
  }

  async loadSubjects(): Promise<void> {
    this.loading = true;
    this.error = null;

    try {
      // Get all subjects
      const subjectNames = await this.schemaRegistry.getSubjects().toPromise() || [];
      
      // Get detailed information for each subject
        const subjectDetails = await Promise.all(
        subjectNames.map(async (subjectName): Promise<SubjectWithMetadata> => {
          try {
            // Get versions
            const versions = await this.schemaRegistry.getSubjectVersions(subjectName).toPromise() || [];
            const latestVersion = Math.max(...versions);
            
            // Get latest schema details
            const latestSchema = await this.schemaRegistry.getSchemaVersion(subjectName, latestVersion).toPromise();
            
            // Get subject compatibility level
            let compatibility: CompatibilityLevel = 'BACKWARD'; // default
            try {
              const compatibilityResult = await this.schemaRegistry.getSubjectCompatibility(subjectName).toPromise();
              compatibility = compatibilityResult || 'BACKWARD';
            } catch (e) {
              console.warn(`Could not get compatibility for ${subjectName}, using default`);
            }

            // Detect actual schema type from the schema content
            const schemaType = latestSchema ? detectSchemaType(latestSchema.schema) : 'JSON';

            return {
              name: subjectName,
              latestVersion,
              totalVersions: versions.length,
              compatibility,
              lastModified: new Date().toISOString(), // Would come from registry metadata
              schemaType
            };
          } catch (error) {
            console.error(`Error loading details for subject ${subjectName}:`, error);
            return {
              name: subjectName,
              latestVersion: 1,
              totalVersions: 1,
              compatibility: 'BACKWARD' as CompatibilityLevel,
              lastModified: new Date().toISOString(),
              schemaType: 'JSON' // Default to JSON for error cases
            };
          }
        })
      );      this.subjects = subjectDetails.sort((a, b) => a.name.localeCompare(b.name));
      this.applyFilters();
      this.isConnected = true;
      
    } catch (error: any) {
      this.error = error.message || 'Failed to load subjects from registry';
      this.isConnected = false;
      console.error('Error loading subjects:', error);
    } finally {
      this.loading = false;
    }
  }

  onSearchChange(event: Event): void {
    const target = event.target as HTMLInputElement;
    this.searchTerm = target.value;
    this.searchSubject.next(this.searchTerm);
  }

  onFilterChange(): void {
    this.applyFilters();
  }

  private applyFilters(): void {
    this.filteredSubjects = this.subjects.filter(subject => {
      // Search term filter
      const matchesSearch = !this.searchTerm || 
        subject.name.toLowerCase().includes(this.searchTerm.toLowerCase());

      // Compatibility filter
      const matchesCompatibility = !this.selectedCompatibility || 
        subject.compatibility === this.selectedCompatibility;

      // Type filter
      const matchesType = !this.selectedType || 
        subject.schemaType === this.selectedType;

      return matchesSearch && matchesCompatibility && matchesType;
    });
  }

  clearFilters(): void {
    this.searchTerm = '';
    this.selectedCompatibility = '';
    this.selectedType = '';
    this.searchSubject.next('');
    this.applyFilters();
  }

  getSchemaIcon(schemaType: string): string {
    switch (schemaType) {
      case 'AVRO':
        return '🔶';
      case 'PROTOBUF':
        return '⚡';
      case 'JSON':
        return '📋';
      default:
        return '📄';
    }
  }

  trackBySubjectName(index: number, subject: SubjectWithMetadata): string {
    return subject.name;
  }

  onSubjectSelect(subject: SubjectWithMetadata): void {
    this.router.navigate(['/registry/subject', subject.name]);
  }

  viewSubjectDetails(event: Event, subject: SubjectWithMetadata): void {
    event.stopPropagation();
    this.router.navigate(['/registry/subject', subject.name, 'details']);
  }

  compareVersions(event: Event, subject: SubjectWithMetadata): void {
    event.stopPropagation();
    this.router.navigate(['/registry/subject', subject.name, 'compare']);
  }

  evolveSchema(event: Event, subject: SubjectWithMetadata): void {
    event.stopPropagation();
    console.log(`Navigating to evolution wizard for subject: ${subject.name}`);
    // Navigate to evolution wizard with subject name as query parameter
    this.router.navigate(['/evolution/wizard'], { 
      queryParams: { subject: subject.name, mode: 'evolve' } 
    });
  }

  createNewSubject(): void {
    this.router.navigate(['/schema-editor'], { 
      queryParams: { mode: 'registry' } 
    });
  }
}