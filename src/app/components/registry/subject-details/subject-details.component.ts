import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Subject as RxSubject, BehaviorSubject, forkJoin, combineLatest } from 'rxjs';
import { takeUntil, switchMap } from 'rxjs/operators';

import { SchemaRegistryService } from '../../../services/registry/schema-registry.service';
import { RegistryClientService } from '../../../services/registry/registry-client.service';
import { 
  Subject as RegistrySubject, 
  SchemaVersion, 
  CompatibilityLevel,
  SubjectVersionResponse,
  detectSchemaType 
} from '../../../models/schema-registry.models';

interface SubjectDetail {
  name: string;
  versions: SchemaVersion[];
  latestVersion: SchemaVersion;
  compatibility: CompatibilityLevel;
  totalVersions: number;
  schemaType: string;
  createdAt: Date;
  updatedAt: Date;
}

@Component({
  selector: 'app-subject-details',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './subject-details.component.html',
  styleUrl: './subject-details.component.scss'
})
export class SubjectDetailsComponent implements OnInit, OnDestroy {
  private destroy$ = new RxSubject<void>();
  
  // Component state
  subjectName: string = '';
  requestedVersion: number | null = null; // Track if user requested a specific version
  subjectDetail: SubjectDetail | null = null;
  loading = false;
  error: string | null = null;
  
  // Compatibility editing state
  editCompatibility = false;
  newCompatibilityLevel: CompatibilityLevel = 'BACKWARD';
  savingCompatibility = false;
  
  // Permissions
  canDeleteSubject = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private schemaRegistry: SchemaRegistryService,
    private registryClient: RegistryClientService
  ) {}

  ngOnInit(): void {
    combineLatest([
      this.route.params,
      this.route.queryParams
    ])
      .pipe(takeUntil(this.destroy$))
      .subscribe(([params, queryParams]) => {
        this.subjectName = params['subjectName'];
        this.requestedVersion = queryParams['version'] ? parseInt(queryParams['version']) : null;
        
        if (this.subjectName) {
          this.loadSubjectDetails();
        }
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  async loadSubjectDetails(): Promise<void> {
    if (!this.subjectName) return;
    
    this.loading = true;
    this.error = null;

    try {
      // Get subject versions
      const versionNumbers = await this.schemaRegistry.getSubjectVersions(this.subjectName).toPromise() || [];
      
      // Get detailed version information
      const versions = await Promise.all(
        versionNumbers.map(async (versionNum): Promise<SchemaVersion> => {
          const versionDetail = await this.schemaRegistry.getSchemaVersion(this.subjectName, versionNum).toPromise();
          return versionDetail!;
        })
      );

      // Get compatibility level
      let compatibility: CompatibilityLevel = 'BACKWARD';
      try {
        compatibility = await this.schemaRegistry.getSubjectCompatibility(this.subjectName).toPromise() || 'BACKWARD';
      } catch (e) {
        console.warn('Could not get compatibility level, using default');
      }

      // Sort versions by version number (descending)
      const sortedVersions = versions.sort((a, b) => b.version - a.version);
      const latestVersion = sortedVersions[0];

      // Detect schema type from the latest version
      const detectedSchemaType = latestVersion ? detectSchemaType(latestVersion.schema) : 'JSON';

      this.subjectDetail = {
        name: this.subjectName,
        versions: sortedVersions,
        latestVersion,
        compatibility,
        totalVersions: versions.length,
        schemaType: detectedSchemaType,
        createdAt: new Date(), // Would come from registry metadata
        updatedAt: new Date()  // Would come from registry metadata
      };

      // Auto-scroll to requested version if specified
      if (this.requestedVersion) {
        setTimeout(() => {
          this.scrollToRequestedVersion();
        }, 200);
      }

      this.newCompatibilityLevel = compatibility;
      this.canDeleteSubject = true; // Would be based on permissions
      
    } catch (error: any) {
      this.error = error.message || 'Failed to load subject details';
      console.error('Error loading subject details:', error);
    } finally {
      this.loading = false;
    }
  }

  goBack(): void {
    this.router.navigate(['/registry']);
  }

  getCompatibilityDescription(level: CompatibilityLevel): string {
    const descriptions: Record<CompatibilityLevel, string> = {
      'BACKWARD': 'New schema can be used to read data written with the previous schema.',
      'BACKWARD_TRANSITIVE': 'New schema can be used to read data written with all previous schemas.',
      'FORWARD': 'Previous schema can be used to read data written with the new schema.',
      'FORWARD_TRANSITIVE': 'All previous schemas can be used to read data written with the new schema.',
      'FULL': 'New schema is both forward and backward compatible with the previous schema.',
      'FULL_TRANSITIVE': 'New schema is both forward and backward compatible with all previous schemas.',
      'NONE': 'No compatibility checking is performed.'
    };
    return descriptions[level];
  }

  async saveCompatibility(): Promise<void> {
    if (!this.subjectDetail) return;
    
    this.savingCompatibility = true;
    
    try {
      await this.schemaRegistry.setSubjectCompatibility(this.subjectDetail.name, this.newCompatibilityLevel).toPromise();
      this.subjectDetail.compatibility = this.newCompatibilityLevel;
      this.editCompatibility = false;
    } catch (error: any) {
      console.error('Error updating compatibility:', error);
      alert('Failed to update compatibility level: ' + (error.message || 'Unknown error'));
    } finally {
      this.savingCompatibility = false;
    }
  }

  cancelEditCompatibility(): void {
    this.editCompatibility = false;
    this.newCompatibilityLevel = this.subjectDetail?.compatibility || 'BACKWARD';
  }

  formatSchema(schema: string): string {
    try {
      const parsed = JSON.parse(schema);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return schema;
    }
  }

  downloadSchema(): void {
    if (!this.subjectDetail) return;
    
    const schema = this.formatSchema(this.subjectDetail.latestVersion.schema);
    const blob = new Blob([schema], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.subjectDetail.name}-v${this.subjectDetail.latestVersion.version}.json`;
    link.click();
    
    window.URL.revokeObjectURL(url);
  }

  copySchema(): void {
    if (!this.subjectDetail) return;
    
    const schema = this.formatSchema(this.subjectDetail.latestVersion.schema);
    navigator.clipboard.writeText(schema).then(() => {
      alert('Schema copied to clipboard!');
    }).catch(() => {
      alert('Failed to copy schema to clipboard');
    });
  }

  editSchema(): void {
    if (!this.subjectDetail) return;
    
    this.router.navigate(['/schema-editor'], {
      queryParams: {
        mode: 'evolve',
        subject: this.subjectDetail.name,
        version: this.subjectDetail.latestVersion.version
      }
    });
  }

  viewVersionHistory(): void {
    if (!this.subjectDetail) return;
    
    this.router.navigate(['/registry/subject', this.subjectDetail.name, 'versions']);
  }

  viewVersion(version: SchemaVersion): void {
    if (!this.subjectDetail) return;
    
    // Set the requested version and highlight it
    this.requestedVersion = version.version;
    
    // Scroll to the version
    setTimeout(() => {
      this.scrollToRequestedVersion();
    }, 100);
  }

  compareVersions(version: SchemaVersion): void {
    if (!this.subjectDetail) return;
    
    this.router.navigate(['/registry/subject', this.subjectDetail.name, 'compare'], {
      queryParams: {
        from: version.version,
        to: this.subjectDetail.latestVersion.version
      }
    });
  }

  evolveSchema(): void {
    if (!this.subjectDetail) return;
    
    this.router.navigate(['/evolution/wizard'], {
      queryParams: { 
        subject: this.subjectDetail.name,
        fromVersion: this.subjectDetail.latestVersion.version,
        mode: 'evolve'
      }
    });
  }

  evolveFromVersion(version: SchemaVersion): void {
    if (!this.subjectDetail) return;
    
    this.router.navigate(['/evolution/wizard'], {
      queryParams: { 
        subject: this.subjectDetail.name,
        fromVersion: version.version,
        mode: 'evolve'
      }
    });
  }

  testCompatibility(): void {
    if (!this.subjectDetail) return;
    
    this.router.navigate(['/registry/compatibility-test'], {
      queryParams: { subject: this.subjectDetail.name }
    });
  }

  exportSubject(): void {
    if (!this.subjectDetail) return;
    
    const exportData = {
      subject: this.subjectDetail.name,
      compatibility: this.subjectDetail.compatibility,
      versions: this.subjectDetail.versions.map(v => ({
        version: v.version,
        id: v.id,
        schema: JSON.parse(v.schema)
      }))
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.subjectDetail.name}-export.json`;
    link.click();
    
    window.URL.revokeObjectURL(url);
  }

  async deleteSubject(): Promise<void> {
    if (!this.subjectDetail || !this.canDeleteSubject) return;
    
    const confirmed = confirm(
      `Are you sure you want to delete subject "${this.subjectDetail.name}"?\n\n` +
      `This will permanently delete all ${this.subjectDetail.totalVersions} versions. ` +
      `This action cannot be undone.`
    );
    
    if (!confirmed) return;
    
    try {
      await this.schemaRegistry.deleteSubject(this.subjectDetail.name, true).toPromise();
      alert('Subject deleted successfully');
      this.router.navigate(['/registry']);
    } catch (error: any) {
      console.error('Error deleting subject:', error);
      alert('Failed to delete subject: ' + (error.message || 'Unknown error'));
    }
  }

  trackByVersion(index: number, version: SchemaVersion): number {
    return version.version;
  }

  isRequestedVersionVisible(): boolean {
    if (!this.requestedVersion || !this.subjectDetail) return true;
    return this.subjectDetail.versions.slice(0, 5).some(v => v.version === this.requestedVersion);
  }

  getRequestedVersionInfo(): SchemaVersion | null {
    if (!this.requestedVersion || !this.subjectDetail) return null;
    return this.subjectDetail.versions.find(v => v.version === this.requestedVersion) || null;
  }

  private scrollToRequestedVersion(): void {
    if (!this.requestedVersion) return;
    
    const element = document.querySelector(`[data-version="${this.requestedVersion}"]`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
}
