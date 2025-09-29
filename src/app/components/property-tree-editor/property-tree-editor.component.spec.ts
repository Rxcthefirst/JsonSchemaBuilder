import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PropertyTreeEditorComponent } from './property-tree-editor.component';

describe('PropertyTreeEditorComponent', () => {
  let component: PropertyTreeEditorComponent;
  let fixture: ComponentFixture<PropertyTreeEditorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PropertyTreeEditorComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(PropertyTreeEditorComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
