import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-feature-guide',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="feature-guide">
      <div class="guide-header">
        <h2>🚀 JSON Schema Builder - Phase 2 Features</h2>
        <p class="guide-description">
          Comprehensive schema registry and evolution management tools for enterprise JSON Schema workflows.
        </p>
      </div>

      <div class="features-grid">
        
        <!-- Registry Management -->
        <div class="feature-section">
          <div class="section-header">
            <h3 class="section-title">
              <span class="title-icon">📚</span>
              Schema Registry Management
            </h3>
          </div>
          
          <div class="feature-cards">
            <div class="feature-card">
              <div class="card-header">
                <span class="card-icon">🔍</span>
                <h4>Subject Browser</h4>
              </div>
              <p class="card-description">
                Browse and search schema subjects with advanced filtering, grid/list views, and real-time connection monitoring.
              </p>
              <div class="card-features">
                <span class="feature-tag">Real-time Search</span>
                <span class="feature-tag">Grid/List Views</span>
                <span class="feature-tag">Connection Status</span>
              </div>
              <a routerLink="/registry/subjects" class="card-action">
                Browse Subjects →
              </a>
            </div>

            <div class="feature-card">
              <div class="card-header">
                <span class="card-icon">📄</span>
                <h4>Subject Details</h4>
              </div>
              <p class="card-description">
                View comprehensive subject metadata, manage compatibility settings, and perform schema operations.
              </p>
              <div class="card-features">
                <span class="feature-tag">Metadata Management</span>
                <span class="feature-tag">Compatibility Config</span>
                <span class="feature-tag">Schema Preview</span>
              </div>
            </div>

            <div class="feature-card">
              <div class="card-header">
                <span class="card-icon">📈</span>
                <h4>Version History</h4>
              </div>
              <p class="card-description">
                Interactive timeline visualization with detailed diff capabilities and evolution analysis.
              </p>
              <div class="card-features">
                <span class="feature-tag">Timeline View</span>
                <span class="feature-tag">Visual Diff</span>
                <span class="feature-tag">Evolution Analysis</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Evolution Tools -->
        <div class="feature-section">
          <div class="section-header">
            <h3 class="section-title">
              <span class="title-icon">🔄</span>
              Schema Evolution Tools
            </h3>
          </div>
          
          <div class="feature-cards">
            <div class="feature-card featured">
              <div class="card-header">
                <span class="card-icon">🧙‍♂️</span>
                <h4>Evolution Wizard</h4>
              </div>
              <p class="card-description">
                Step-by-step guided process for safe schema evolution with automated compatibility analysis and migration planning.
              </p>
              <div class="card-features">
                <span class="feature-tag">5-Step Workflow</span>
                <span class="feature-tag">Auto Analysis</span>
                <span class="feature-tag">Migration Planning</span>
              </div>
              <a routerLink="/evolution/wizard" class="card-action primary">
                Start Evolution Wizard →
              </a>
            </div>

            <div class="feature-card">
              <div class="card-header">
                <span class="card-icon">🔍</span>
                <h4>Compatibility Checker</h4>
              </div>
              <p class="card-description">
                Standalone testing tool for compatibility analysis with detailed breaking change detection and migration guidance.
              </p>
              <div class="card-features">
                <span class="feature-tag">Breaking Changes</span>
                <span class="feature-tag">Test History</span>
                <span class="feature-tag">Export Reports</span>
              </div>
              <a routerLink="/evolution/compatibility" class="card-action">
                Run Compatibility Test →
              </a>
            </div>

            <div class="feature-card">
              <div class="card-header">
                <span class="card-icon">⚖️</span>
                <h4>Version Compare</h4>
              </div>
              <p class="card-description">
                Detailed visual comparison between schema versions with side-by-side diff and migration recommendations.
              </p>
              <div class="card-features">
                <span class="feature-tag">Side-by-Side</span>
                <span class="feature-tag">Unified Diff</span>
                <span class="feature-tag">Migration Advice</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Quick Actions -->
        <div class="feature-section">
          <div class="section-header">
            <h3 class="section-title">
              <span class="title-icon">⚡</span>
              Quick Actions
            </h3>
          </div>
          
          <div class="quick-actions">
            <a routerLink="/evolution/wizard" class="quick-action primary">
              <span class="action-icon">🧙‍♂️</span>
              <div class="action-content">
                <strong>Start Schema Evolution</strong>
                <p>Guided wizard for safe schema changes</p>
              </div>
            </a>

            <a routerLink="/registry/subjects" class="quick-action">
              <span class="action-icon">📚</span>
              <div class="action-content">
                <strong>Browse Registry</strong>
                <p>Explore existing schema subjects</p>
              </div>
            </a>

            <a routerLink="/evolution/compatibility" class="quick-action">
              <span class="action-icon">🔍</span>
              <div class="action-content">
                <strong>Test Compatibility</strong>
                <p>Check schema compatibility</p>
              </div>
            </a>

            <a routerLink="/schema-editor" class="quick-action">
              <span class="action-icon">📝</span>
              <div class="action-content">
                <strong>Schema Editor</strong>
                <p>Create new JSON schemas</p>
              </div>
            </a>
          </div>
        </div>

        <!-- Best Practices -->
        <div class="feature-section">
          <div class="section-header">
            <h3 class="section-title">
              <span class="title-icon">💡</span>
              Best Practices
            </h3>
          </div>
          
          <div class="best-practices">
            <div class="practice-item">
              <span class="practice-icon">✅</span>
              <div class="practice-content">
                <strong>Use Backward Compatibility</strong>
                <p>Ensure new schemas can read data written with older schemas.</p>
              </div>
            </div>

            <div class="practice-item">
              <span class="practice-icon">⚠️</span>
              <div class="practice-content">
                <strong>Analyze Before Deploying</strong>
                <p>Always run compatibility checks before schema deployment.</p>
              </div>
            </div>

            <div class="practice-item">
              <span class="practice-icon">📋</span>
              <div class="practice-content">
                <strong>Follow Semantic Versioning</strong>
                <p>Use major versions for breaking changes, minor for additive changes.</p>
              </div>
            </div>

            <div class="practice-item">
              <span class="practice-icon">🔄</span>
              <div class="practice-content">
                <strong>Plan Migration Path</strong>
                <p>Document migration steps for consumers of your schemas.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .feature-guide {
      padding: 32px 24px;
      max-width: 1200px;
      margin: 0 auto;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      border-radius: 16px;
      color: white;
      margin-bottom: 32px;
    }

    .guide-header {
      text-align: center;
      margin-bottom: 48px;
    }

    .guide-header h2 {
      margin: 0 0 16px 0;
      font-size: 32px;
      font-weight: bold;
    }

    .guide-description {
      font-size: 18px;
      opacity: 0.9;
      max-width: 600px;
      margin: 0 auto;
      line-height: 1.6;
    }

    .features-grid {
      display: flex;
      flex-direction: column;
      gap: 48px;
    }

    .feature-section {
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 32px;
      backdrop-filter: blur(10px);
    }

    .section-header {
      margin-bottom: 24px;
    }

    .section-title {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 0;
      font-size: 24px;
      font-weight: bold;
    }

    .title-icon {
      font-size: 28px;
    }

    .feature-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 24px;
    }

    .feature-card {
      background: rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      padding: 24px;
      transition: all 0.3s ease;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .feature-card:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
    }

    .feature-card.featured {
      background: rgba(255, 255, 255, 0.25);
      border: 2px solid rgba(255, 255, 255, 0.4);
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 16px;
    }

    .card-icon {
      font-size: 24px;
    }

    .card-header h4 {
      margin: 0;
      font-size: 20px;
      font-weight: bold;
    }

    .card-description {
      margin: 0 0 16px 0;
      line-height: 1.6;
      opacity: 0.9;
    }

    .card-features {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
    }

    .feature-tag {
      background: rgba(255, 255, 255, 0.2);
      padding: 4px 8px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid rgba(255, 255, 255, 0.3);
    }

    .card-action {
      display: inline-flex;
      align-items: center;
      background: rgba(255, 255, 255, 0.2);
      color: white;
      text-decoration: none;
      padding: 8px 16px;
      border-radius: 8px;
      font-weight: 500;
      transition: all 0.2s ease;
      border: 1px solid rgba(255, 255, 255, 0.3);
    }

    .card-action:hover {
      background: rgba(255, 255, 255, 0.3);
      transform: translateX(4px);
    }

    .card-action.primary {
      background: #3b82f6;
      border-color: #3b82f6;
    }

    .card-action.primary:hover {
      background: #2563eb;
      transform: translateX(4px);
    }

    /* Quick Actions */
    .quick-actions {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 16px;
    }

    .quick-action {
      display: flex;
      align-items: center;
      gap: 16px;
      background: rgba(255, 255, 255, 0.15);
      border: 1px solid rgba(255, 255, 255, 0.2);
      border-radius: 12px;
      padding: 20px;
      text-decoration: none;
      color: white;
      transition: all 0.3s ease;
    }

    .quick-action:hover {
      background: rgba(255, 255, 255, 0.25);
      transform: translateY(-2px);
    }

    .quick-action.primary {
      background: rgba(59, 130, 246, 0.3);
      border-color: rgba(59, 130, 246, 0.5);
    }

    .action-icon {
      font-size: 32px;
      flex-shrink: 0;
    }

    .action-content strong {
      display: block;
      font-size: 16px;
      margin-bottom: 4px;
    }

    .action-content p {
      margin: 0;
      font-size: 14px;
      opacity: 0.8;
    }

    /* Best Practices */
    .best-practices {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 20px;
    }

    .practice-item {
      display: flex;
      align-items: flex-start;
      gap: 16px;
      background: rgba(255, 255, 255, 0.1);
      padding: 20px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .practice-icon {
      font-size: 24px;
      flex-shrink: 0;
      margin-top: 4px;
    }

    .practice-content strong {
      display: block;
      font-size: 16px;
      margin-bottom: 4px;
    }

    .practice-content p {
      margin: 0;
      font-size: 14px;
      opacity: 0.9;
      line-height: 1.5;
    }

    /* Responsive Design */
    @media (max-width: 768px) {
      .feature-guide {
        padding: 24px 16px;
        margin: 0 16px 24px 16px;
        border-radius: 12px;
      }

      .guide-header h2 {
        font-size: 24px;
      }

      .guide-description {
        font-size: 16px;
      }

      .features-grid {
        gap: 32px;
      }

      .feature-section {
        padding: 24px 20px;
      }

      .section-title {
        font-size: 20px;
      }

      .feature-cards {
        grid-template-columns: 1fr;
      }

      .quick-actions {
        grid-template-columns: 1fr;
      }

      .quick-action {
        flex-direction: column;
        text-align: center;
        gap: 12px;
      }

      .best-practices {
        grid-template-columns: 1fr;
      }
    }
  `]
})
export class FeatureGuideComponent {
  
}