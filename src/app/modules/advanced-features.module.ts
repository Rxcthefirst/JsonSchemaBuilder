import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

// Import all advanced editor components
import { OneOfEditorComponent } from '../components/oneof-editor/oneof-editor.component';
import { DependencyEditorComponent } from '../components/dependency-editor/dependency-editor.component';
import { PatternPropertiesEditorComponent } from '../components/pattern-properties-editor/pattern-properties-editor.component';
import { AdvancedArrayEditorComponent } from '../components/advanced-array-editor/advanced-array-editor.component';
import { ReferenceManagerComponent } from '../components/reference-manager/reference-manager.component';

@NgModule({
  imports: [
    CommonModule,
    FormsModule,
    // Import all components as standalone
    OneOfEditorComponent,
    DependencyEditorComponent,
    PatternPropertiesEditorComponent,
    AdvancedArrayEditorComponent,
    ReferenceManagerComponent
  ],
  exports: [
    OneOfEditorComponent,
    DependencyEditorComponent,
    PatternPropertiesEditorComponent,
    AdvancedArrayEditorComponent,
    ReferenceManagerComponent
  ]
})
export class AdvancedFeaturesModule { }