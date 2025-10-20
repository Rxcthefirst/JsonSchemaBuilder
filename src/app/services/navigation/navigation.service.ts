import { Injectable } from '@angular/core';
import { Router, NavigationEnd } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { filter } from 'rxjs/operators';

export interface BreadcrumbItem {
  label: string;
  url: string;
  icon?: string;
  active: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class NavigationService {
  private breadcrumbsSubject = new BehaviorSubject<BreadcrumbItem[]>([]);
  public breadcrumbs$ = this.breadcrumbsSubject.asObservable();

  private routeLabels: { [key: string]: string } = {
    '/editor': 'Schema Editor',
    '/registry': 'Registry',
    '/registry/subjects': 'Browse Subjects',
    '/evolution': 'Evolution Tools',
    '/evolution/wizard': 'Evolution Wizard',
    '/evolution/compatibility': 'Compatibility Checker'
  };

  private routeIcons: { [key: string]: string } = {
    '/editor': '📝',
    '/registry': '📚',
    '/registry/subjects': '📚',
    '/evolution': '🔄',
    '/evolution/wizard': '🧙‍♂️',
    '/evolution/compatibility': '🔍'
  };

  constructor(private router: Router) {
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.generateBreadcrumbs(event.urlAfterRedirects);
      });
  }

  private generateBreadcrumbs(url: string): void {
    const breadcrumbs: BreadcrumbItem[] = [];
    const segments = url.split('/').filter(segment => segment);
    
    let currentPath = '';
    
    segments.forEach((segment, index) => {
      currentPath += '/' + segment;
      const isActive = index === segments.length - 1;
      
      // Handle dynamic route segments
      let label = this.routeLabels[currentPath];
      let icon = this.routeIcons[currentPath];
      
      if (!label) {
        // Check for dynamic segments like subject names
        if (segments[index - 1] === 'subject') {
          label = `Subject: ${segment}`;
          icon = '📄';
        } else if (segments[index - 1] === 'compare') {
          label = `Compare: ${segment}`;
          icon = '🔍';
        } else {
          // Fallback to segment name
          label = segment.charAt(0).toUpperCase() + segment.slice(1).replace(/-/g, ' ');
        }
      }
      
      breadcrumbs.push({
        label,
        url: currentPath,
        icon,
        active: isActive
      });
    });

    this.breadcrumbsSubject.next(breadcrumbs);
  }

  navigate(route: string, params?: any): void {
    if (params) {
      this.router.navigate([route], params);
    } else {
      this.router.navigate([route]);
    }
  }

  navigateToSubject(subjectName: string): void {
    this.router.navigate(['/registry/subject', subjectName, 'details']);
  }

  navigateToVersionHistory(subjectName: string): void {
    this.router.navigate(['/registry/subject', subjectName, 'versions']);
  }

  navigateToVersionCompare(subjectName: string, fromVersion?: number, toVersion?: number): void {
    const queryParams: any = {};
    if (fromVersion !== undefined) queryParams.from = fromVersion;
    if (toVersion !== undefined) queryParams.to = toVersion;
    
    this.router.navigate(['/registry/subject', subjectName, 'compare'], { 
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined 
    });
  }

  navigateToEvolutionWizard(subjectName?: string, version?: number): void {
    const queryParams: any = {};
    if (subjectName) queryParams.subject = subjectName;
    if (version !== undefined) queryParams.version = version;
    
    this.router.navigate(['/evolution/wizard'], { 
      queryParams: Object.keys(queryParams).length > 0 ? queryParams : undefined 
    });
  }

  goBack(): void {
    window.history.back();
  }

  updateRouteLabel(route: string, label: string, icon?: string): void {
    this.routeLabels[route] = label;
    if (icon) {
      this.routeIcons[route] = icon;
    }
  }

  isActive(route: string): boolean {
    return this.router.url === route || this.router.url.startsWith(route + '/');
  }

  getCurrentRoute(): string {
    return this.router.url;
  }
}