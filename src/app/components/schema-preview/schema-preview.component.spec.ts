import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SchemaPreviewComponent } from './schema-preview.component';

describe('SchemaPreviewComponent', () => {
  let component: SchemaPreviewComponent;
  let fixture: ComponentFixture<SchemaPreviewComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SchemaPreviewComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SchemaPreviewComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
