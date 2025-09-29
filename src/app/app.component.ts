import { Component } from '@angular/core';
import { SchemaEditorComponent } from './components/schema-editor/schema-editor.component';

@Component({
  selector: 'app-root',
  imports: [SchemaEditorComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  title = 'JsonSchemaGenerator';
}
