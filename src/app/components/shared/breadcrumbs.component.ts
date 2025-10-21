import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';

import { NavigationService, BreadcrumbItem } from '../../services/navigation/navigation.service';

@Component({
  selector: 'app-breadcrumbs',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <nav class="breadcrumbs" *ngIf="breadcrumbs.length > 0">
      <div class="breadcrumb-container">
        <ol class="breadcrumb-list">
          <li class="breadcrumb-item home">
            <a routerLink="/home" class="breadcrumb-link" title="Go to Home">
              <span class="breadcrumb-icon">🏠</span>
              <span class="breadcrumb-text">Home</span>
            </a>
          </li>
          
          <li 
            *ngFor="let crumb of breadcrumbs; let last = last"
            class="breadcrumb-item"
            [class.active]="crumb.active"
          >
            <span class="breadcrumb-separator">›</span>
            
            <a 
              *ngIf="!crumb.active" 
              [routerLink]="crumb.url"
              class="breadcrumb-link"
              [title]="'Go to ' + crumb.label"
            >
              <span class="breadcrumb-icon" *ngIf="crumb.icon">{{ crumb.icon }}</span>
              <span class="breadcrumb-text">{{ crumb.label }}</span>
            </a>
            
            <span 
              *ngIf="crumb.active" 
              class="breadcrumb-current"
              [title]="'Current page: ' + crumb.label"
            >
              <span class="breadcrumb-icon" *ngIf="crumb.icon">{{ crumb.icon }}</span>
              <span class="breadcrumb-text">{{ crumb.label }}</span>
            </span>
          </li>
        </ol>
        
        <!-- Quick Actions -->
        <div class="breadcrumb-actions">
          <button 
            class="action-btn back-btn"
            (click)="goBack()"
            title="Go back"
          >
            ← Back
          </button>
          
          <div class="action-divider"></div>
          
          <button 
            class="action-btn menu-btn"
            (click)="toggleQuickMenu()"
            [class.active]="showQuickMenu"
            title="Quick navigation"
          >
            ⚡ Quick Nav
          </button>
          
          <!-- Quick Menu Dropdown -->
          <div class="quick-menu" *ngIf="showQuickMenu">
            <div class="quick-menu-section">
              <h4 class="quick-menu-title">Registry</h4>
              <a routerLink="/registry/subjects" class="quick-menu-item">
                <span class="quick-item-icon">📚</span>
                Browse Subjects
              </a>
            </div>
            
            <div class="quick-menu-section">
              <h4 class="quick-menu-title">Evolution</h4>
              <a routerLink="/evolution/wizard" class="quick-menu-item">
                <span class="quick-item-icon">🧙‍♂️</span>
                Evolution Wizard
              </a>
              <a routerLink="/evolution/compatibility" class="quick-menu-item">
                <span class="quick-item-icon">🔍</span>
                Compatibility Checker
              </a>
            </div>
            
            <div class="quick-menu-section">
              <h4 class="quick-menu-title">Tools</h4>
              <a routerLink="/schema-editor" class="quick-menu-item">
                <span class="quick-item-icon">📝</span>
                Schema Editor
              </a>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `,
  styles: [`
    .breadcrumbs {
      background: #f8fafc;
      border-bottom: 1px solid #e2e8f0;
      padding: 12px 0;
      position: sticky;
      top: 0;
      z-index: 100;
    }

    .breadcrumb-container {
      display: flex;
      align-items: center;
      justify-content: space-between;
      max-width: 1400px;
      margin: 0 auto;
      padding: 0 24px;
    }

    .breadcrumb-list {
      display: flex;
      align-items: center;
      list-style: none;
      margin: 0;
      padding: 0;
      gap: 4px;
    }

    .breadcrumb-item {
      display: flex;
      align-items: center;
      gap: 4px;
    }

    .breadcrumb-item.home .breadcrumb-link {
      background: #3b82f6;
      color: white;
      border-radius: 4px;
      padding: 4px 8px;
    }

    .breadcrumb-separator {
      color: #94a3b8;
      font-size: 14px;
      margin: 0 8px;
      user-select: none;
    }

    .breadcrumb-link {
      display: flex;
      align-items: center;
      gap: 6px;
      text-decoration: none;
      color: #64748b;
      font-size: 14px;
      font-weight: 500;
      padding: 4px 8px;
      border-radius: 4px;
      transition: all 0.2s ease;
    }

    .breadcrumb-link:hover {
      background: #e2e8f0;
      color: #334155;
    }

    .breadcrumb-current {
      display: flex;
      align-items: center;
      gap: 6px;
      color: #1e293b;
      font-size: 14px;
      font-weight: 600;
      padding: 4px 8px;
    }

    .breadcrumb-icon {
      font-size: 12px;
      opacity: 0.8;
    }

    .breadcrumb-text {
      white-space: nowrap;
    }

    /* Quick Actions */
    .breadcrumb-actions {
      display: flex;
      align-items: center;
      gap: 8px;
      position: relative;
    }

    .action-btn {
      padding: 6px 12px;
      border: 1px solid #d1d5db;
      background: white;
      color: #374151;
      border-radius: 4px;
      cursor: pointer;
      font-size: 12px;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .action-btn:hover {
      background: #f3f4f6;
      border-color: #9ca3af;
    }

    .back-btn {
      color: #6b7280;
    }

    .menu-btn.active {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }

    .action-divider {
      width: 1px;
      height: 20px;
      background: #d1d5db;
    }

    /* Quick Menu */
    .quick-menu {
      position: absolute;
      top: 100%;
      right: 0;
      margin-top: 8px;
      background: white;
      border: 1px solid #d1d5db;
      border-radius: 8px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05);
      padding: 8px 0;
      min-width: 200px;
      z-index: 50;
    }

    .quick-menu-section {
      padding: 8px 0;
    }

    .quick-menu-section:not(:last-child) {
      border-bottom: 1px solid #f1f5f9;
    }

    .quick-menu-title {
      padding: 4px 16px;
      margin: 0 0 4px 0;
      font-size: 11px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .quick-menu-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 16px;
      text-decoration: none;
      color: #374151;
      font-size: 13px;
      font-weight: 500;
      transition: all 0.2s ease;
    }

    .quick-menu-item:hover {
      background: #f8fafc;
      color: #1f2937;
    }

    .quick-item-icon {
      font-size: 14px;
      width: 16px;
      text-align: center;
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      .breadcrumb-container {
        padding: 0 16px;
        flex-direction: column;
        gap: 12px;
        align-items: stretch;
      }

      .breadcrumb-list {
        flex-wrap: wrap;
        justify-content: center;
      }

      .breadcrumb-actions {
        justify-content: center;
      }

      .breadcrumb-text {
        display: none;
      }

      .breadcrumb-item.home .breadcrumb-text {
        display: inline;
      }

      .quick-menu {
        right: auto;
        left: 50%;
        transform: translateX(-50%);
      }
    }

    @media (max-width: 480px) {
      .breadcrumb-container {
        padding: 0 12px;
      }

      .breadcrumb-separator {
        margin: 0 4px;
        font-size: 12px;
      }

      .action-btn {
        padding: 4px 8px;
        font-size: 11px;
      }
    }
  `]
})
export class BreadcrumbsComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();
  
  breadcrumbs: BreadcrumbItem[] = [];
  showQuickMenu = false;

  constructor(private navigationService: NavigationService) {}

  ngOnInit(): void {
    this.navigationService.breadcrumbs$
      .pipe(takeUntil(this.destroy$))
      .subscribe(breadcrumbs => {
        this.breadcrumbs = breadcrumbs;
      });

    // Close quick menu when clicking outside
    document.addEventListener('click', this.handleClickOutside.bind(this));
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    document.removeEventListener('click', this.handleClickOutside.bind(this));
  }

  goBack(): void {
    this.navigationService.goBack();
  }

  toggleQuickMenu(): void {
    this.showQuickMenu = !this.showQuickMenu;
  }

  private handleClickOutside(event: Event): void {
    const target = event.target as HTMLElement;
    const quickMenu = document.querySelector('.quick-menu');
    const menuBtn = document.querySelector('.menu-btn');
    
    if (this.showQuickMenu && quickMenu && menuBtn && 
        !quickMenu.contains(target) && !menuBtn.contains(target)) {
      this.showQuickMenu = false;
    }
  }
}