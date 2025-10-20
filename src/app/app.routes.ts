import { Routes } from '@angular/router';
import { HomeComponent } from './components/home/home.component';
import { SchemaEditorComponent } from './components/schema-editor/schema-editor.component';
import { ModernSchemaEditorComponent } from './components/schema-editor/modern-schema-editor.component';

// Phase 2 Registry Components
import { SubjectBrowserComponent } from './components/registry/subject-browser.component';
import { SubjectDetailsComponent } from './components/registry/subject-details.component';
import { VersionHistoryComponent } from './components/registry/version-history.component';

// Phase 2 Evolution Components  
import { SchemaEvolutionWizardComponent } from './components/evolution/schema-evolution-wizard.component';
import { VersionCompareComponent } from './components/evolution/version-compare.component';
import { CompatibilityCheckerComponent } from './components/evolution/compatibility-checker.component';

export const routes: Routes = [
  { 
    path: '', 
    redirectTo: '/home', 
    pathMatch: 'full' 
  },

  // Home/Landing Page
  { 
    path: 'home', 
    component: HomeComponent,
    title: 'Schema Registry Builder'
  },
  
  // Modern Registry-Focused Schema Editor
  { 
    path: 'schema-editor', 
    component: ModernSchemaEditorComponent,
    title: 'Schema Registry Editor'
  },
  
  // Legacy Editor (for comparison/fallback)
  { 
    path: 'editor', 
    component: SchemaEditorComponent,
    title: 'JSON Schema Builder (Legacy)'
  },
  
  // Phase 2 - Schema Registry Management
  {
    path: 'registry',
    children: [
      {
        path: '',
        redirectTo: 'subjects',
        pathMatch: 'full'
      },
      {
        path: 'subjects',
        component: SubjectBrowserComponent,
        title: 'Schema Registry - Browse Subjects'
      },
      {
        path: 'subject/:subjectName',
        children: [
          {
            path: '',
            redirectTo: 'details',
            pathMatch: 'full'
          },
          {
            path: 'details',
            component: SubjectDetailsComponent,
            title: 'Subject Details'
          },
          {
            path: 'versions',
            component: VersionHistoryComponent,
            title: 'Version History'
          },
          {
            path: 'compare',
            component: VersionCompareComponent,
            title: 'Version Comparison'
          }
        ]
      }
    ]
  },
  
  // Phase 2 - Schema Evolution Tools
  {
    path: 'evolution',
    children: [
      {
        path: '',
        redirectTo: 'wizard',
        pathMatch: 'full'
      },
      {
        path: 'wizard',
        component: SchemaEvolutionWizardComponent,
        title: 'Schema Evolution Wizard'
      },
      {
        path: 'compatibility',
        component: CompatibilityCheckerComponent,
        title: 'Compatibility Checker'
      },
      {
        path: 'compare/:subjectName',
        component: VersionCompareComponent,
        title: 'Schema Version Comparison'
      }
    ]
  },

  // Wildcard route - keep this last
  { 
    path: '**', 
    redirectTo: '/editor' 
  }
];
