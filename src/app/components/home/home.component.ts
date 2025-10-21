import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {
  constructor(private router: Router) {}

  navigateToEditor(): void {
    this.router.navigate(['/schema-editor']);
  }

  navigateToRegistry(): void {
    this.router.navigate(['/registry/subjects']);
  }

  navigateToEvolution(): void {
    this.router.navigate(['/evolution']);
  }

  navigateToVersioning(): void {
    this.router.navigate(['/registry/subjects']);
  }

  navigateToCompatibility(): void {
    this.router.navigate(['/evolution/compatibility']);
  }

  navigateToLegacyEditor(): void {
    this.router.navigate(['/editor']);
  }
}