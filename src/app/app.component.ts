import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet, RouterModule, Router } from '@angular/router';
import { BreadcrumbsComponent } from './components/shared/breadcrumbs.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, RouterOutlet, RouterModule, BreadcrumbsComponent],
  template: `
    <div class="app-container">
      <!-- Main Navigation -->
      <nav class="main-nav">
        <div class="nav-brand">
          <h1 class="brand-title">JSON Schema Builder</h1>
          <span class="brand-subtitle">Registry & Evolution Management</span>
        </div>
        
        <div class="nav-sections">
          <!-- Phase 1: Core Editor -->
          <div class="nav-section">
            <h3 class="section-title">Editor</h3>
            <ul class="nav-links">
              <li>
                <a 
                  routerLink="/schema-editor" 
                  routerLinkActive="active"
                  class="nav-link"
                  title="Modern Schema Registry Editor"
                >
                  <span class="link-icon">📝</span>
                  Schema Editor
                </a>
              </li>
            </ul>
          </div>

          <!-- Phase 2: Registry Management -->
          <div class="nav-section">
            <h3 class="section-title">Registry</h3>
            <ul class="nav-links">
              <li>
                <a 
                  routerLink="/registry/subjects" 
                  routerLinkActive="active"
                  class="nav-link"
                  title="Browse and manage schema subjects"
                >
                  <span class="link-icon">📚</span>
                  <span class="link-text">Browse Subjects</span>
                </a>
              </li>
            </ul>
          </div>

          <!-- Phase 2: Evolution Tools -->
          <div class="nav-section">
            <h3 class="section-title">Evolution</h3>
            <ul class="nav-links">
              <li>
                <a 
                  routerLink="/evolution/wizard" 
                  routerLinkActive="active"
                  class="nav-link"
                  title="Guided schema evolution process"
                >
                  <span class="link-icon">🧙‍♂️</span>
                  <span class="link-text">Evolution Wizard</span>
                </a>
              </li>
              <li>
                <a 
                  routerLink="/evolution/compatibility" 
                  routerLinkActive="active"
                  class="nav-link"
                  title="Test schema compatibility"
                >
                  <span class="link-icon">🔍</span>
                  <span class="link-text">Compatibility Checker</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <!-- Navigation Toggle for Mobile -->
        <button 
          class="nav-toggle"
          (click)="toggleNav()"
          [class.active]="navOpen"
          title="Toggle navigation"
        >
          <span class="toggle-bar"></span>
          <span class="toggle-bar"></span>
          <span class="toggle-bar"></span>
        </button>
      </nav>

      <!-- Breadcrumbs -->
      <app-breadcrumbs></app-breadcrumbs>

      <!-- Main Content Area -->
      <main class="main-content" [class.nav-open]="navOpen">
        <router-outlet></router-outlet>
      </main>

      <!-- Footer -->
      <footer class="app-footer">
        <div class="footer-content">
          <span class="footer-text">JSON Schema Builder v2.0 - Registry Evolution Management</span>
          <div class="footer-links">
            <a href="#" class="footer-link">Documentation</a>
            <a href="#" class="footer-link">GitHub</a>
            <a href="#" class="footer-link">Issues</a>
          </div>
        </div>
      </footer>
    </div>
  `,
  styles: [`
    .app-container {
      display: flex;
      flex-direction: column;
      min-height: 100vh;
      background: #f5f7fa;
    }

    /* Main Navigation */
    .main-nav {
      background: #1e293b;
      color: white;
      padding: 16px 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-wrap: wrap;
      gap: 24px;
    }

    .nav-brand {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .brand-title {
      margin: 0;
      font-size: 24px;
      font-weight: bold;
      color: #e2e8f0;
    }

    .brand-subtitle {
      font-size: 12px;
      color: #94a3b8;
      font-weight: 500;
    }

    .nav-sections {
      display: flex;
      gap: 32px;
      align-items: center;
    }

    .nav-section {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .section-title {
      margin: 0;
      font-size: 12px;
      color: #94a3b8;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.5px;
    }

    .nav-links {
      list-style: none;
      padding: 0;
      margin: 0;
      display: flex;
      gap: 16px;
    }

    .nav-link {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 12px;
      border-radius: 6px;
      text-decoration: none;
      color: #cbd5e1;
      font-size: 14px;
      font-weight: 500;
      transition: all 0.2s ease;
      white-space: nowrap;
    }

    .nav-link:hover {
      background: #334155;
      color: #e2e8f0;
      transform: translateY(-1px);
    }

    .nav-link.active {
      background: #3b82f6;
      color: white;
      box-shadow: 0 2px 4px rgba(59, 130, 246, 0.3);
    }

    .link-icon {
      font-size: 16px;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 20px;
    }

    .link-text {
      font-size: 13px;
    }

    /* Mobile Navigation Toggle */
    .nav-toggle {
      display: none;
      flex-direction: column;
      gap: 4px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 8px;
      border-radius: 4px;
      transition: background 0.2s ease;
    }

    .nav-toggle:hover {
      background: #334155;
    }

    .toggle-bar {
      width: 20px;
      height: 2px;
      background: #cbd5e1;
      border-radius: 1px;
      transition: all 0.3s ease;
    }

    .nav-toggle.active .toggle-bar:nth-child(1) {
      transform: rotate(45deg) translate(5px, 5px);
    }

    .nav-toggle.active .toggle-bar:nth-child(2) {
      opacity: 0;
    }

    .nav-toggle.active .toggle-bar:nth-child(3) {
      transform: rotate(-45deg) translate(7px, -6px);
    }

    /* Main Content */
    .main-content {
      flex: 1;
      background: #ffffff;
      min-height: calc(100vh - 140px);
      transition: margin-left 0.3s ease;
    }

    /* Footer */
    .app-footer {
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      padding: 16px 24px;
      margin-top: auto;
    }

    .footer-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      max-width: 1400px;
      margin: 0 auto;
    }

    .footer-text {
      color: #64748b;
      font-size: 13px;
    }

    .footer-links {
      display: flex;
      gap: 16px;
    }

    .footer-link {
      color: #64748b;
      text-decoration: none;
      font-size: 13px;
      transition: color 0.2s ease;
    }

    .footer-link:hover {
      color: #3b82f6;
    }

    /* Responsive Design */
    @media (max-width: 1024px) {
      .nav-sections {
        gap: 24px;
      }
      
      .section-title {
        font-size: 11px;
      }
      
      .link-text {
        font-size: 12px;
      }
    }

    @media (max-width: 768px) {
      .main-nav {
        flex-direction: column;
        align-items: stretch;
        position: relative;
      }

      .nav-toggle {
        display: flex;
        position: absolute;
        top: 16px;
        right: 24px;
      }

      .nav-brand {
        align-self: flex-start;
        margin-bottom: 16px;
      }

      .nav-sections {
        display: none;
        flex-direction: column;
        gap: 20px;
        width: 100%;
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #334155;
      }

      .nav-sections.show {
        display: flex;
      }

      .nav-section {
        width: 100%;
      }

      .nav-links {
        flex-direction: column;
        gap: 8px;
      }

      .nav-link {
        padding: 12px;
        justify-content: flex-start;
      }

      .footer-content {
        flex-direction: column;
        gap: 12px;
        text-align: center;
      }

      .footer-links {
        justify-content: center;
      }
    }

    @media (max-width: 480px) {
      .main-nav {
        padding: 12px 16px;
      }

      .brand-title {
        font-size: 20px;
      }

      .brand-subtitle {
        font-size: 11px;
      }

      .nav-toggle {
        right: 16px;
      }

      .app-footer {
        padding: 12px 16px;
      }
    }
  `]
})
export class AppComponent {
  title = 'JSON Schema Builder';
  navOpen = false;

  constructor(private router: Router) {}

  toggleNav(): void {
    this.navOpen = !this.navOpen;
    
    // Add event listener to close nav when clicking outside on mobile
    if (this.navOpen) {
      document.addEventListener('click', this.closeNavOnOutsideClick.bind(this));
    } else {
      document.removeEventListener('click', this.closeNavOnOutsideClick.bind(this));
    }
  }

  private closeNavOnOutsideClick(event: Event): void {
    const target = event.target as HTMLElement;
    const nav = document.querySelector('.main-nav');
    
    if (nav && !nav.contains(target)) {
      this.navOpen = false;
      document.removeEventListener('click', this.closeNavOnOutsideClick.bind(this));
    }
  }
}
