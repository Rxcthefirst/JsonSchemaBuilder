import { Component, Input, OnInit, OnChanges, SimpleChanges, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { JsonSchema, SchemaProperty, PropertyType } from '../../models/schema.models';

interface DiagramNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: PropertyType;
  name: string;
  title?: string;
  required: boolean;
  children: string[];
  parent?: string;
  level: number;
}

interface DiagramConnection {
  from: string;
  to: string;
  type: 'property' | 'array' | 'reference';
}

interface DiagramLayout {
  nodes: DiagramNode[];
  connections: DiagramConnection[];
  bounds: { width: number; height: number };
}

@Component({
  selector: 'app-schema-diagram',
  imports: [CommonModule, FormsModule],
  template: `
    <div class="diagram-container">
      <!-- Diagram Controls -->
      <div class="diagram-toolbar">
        <div class="toolbar-section">
          <button class="btn btn-sm" (click)="zoomIn()" title="Zoom In">
            🔍+
          </button>
          <button class="btn btn-sm" (click)="zoomOut()" title="Zoom Out">
            🔍-
          </button>
          <button class="btn btn-sm" (click)="resetZoom()" title="Reset Zoom">
            🔍↻
          </button>
          <button class="btn btn-sm" (click)="centerDiagram()" title="Center">
            🎯
          </button>
        </div>
        
        <div class="toolbar-section">
          <select [(ngModel)]="selectedLayout" (change)="updateLayout()" class="layout-select">
            <option value="hierarchical">Hierarchical</option>
            <option value="radial">Radial</option>
            <option value="force">Force-Directed</option>
          </select>
          
          <select [(ngModel)]="selectedTheme" (change)="updateTheme()" class="theme-select">
            <option value="default">Default</option>
            <option value="dark">Dark</option>
            <option value="colorful">Colorful</option>
            <option value="minimal">Minimal</option>
          </select>
        </div>
        
        <div class="toolbar-section">
          <button class="btn btn-sm btn-outline" (click)="normalizeDiagram()" title="Normalize Layout">
            📐 Normalize
          </button>
          <button class="btn btn-sm btn-primary" (click)="exportSVG()" title="Export SVG">
            💾 SVG
          </button>
        </div>
      </div>

      <!-- SVG Diagram -->
      <div class="diagram-viewport" #viewport>
        <svg 
          #svgElement
          [attr.width]="svgWidth" 
          [attr.height]="svgHeight"
          [attr.viewBox]="viewBox"
          class="schema-diagram-svg"
          (mousedown)="onMouseDown($event)"
          (mousemove)="onMouseMove($event)"
          (mouseup)="onMouseUp()"
          (wheel)="onWheel($event)">
          
          <!-- Grid Pattern -->
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e0e0e0" stroke-width="1"/>
            </pattern>
            
            <!-- Node Type Gradients -->
            <linearGradient id="objectGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#4285f4;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#3367d6;stop-opacity:1" />
            </linearGradient>
            <linearGradient id="arrayGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#34a853;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#2d7a3e;stop-opacity:1" />
            </linearGradient>
            <linearGradient id="stringGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#ff9800;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#e68900;stop-opacity:1" />
            </linearGradient>
            <linearGradient id="numberGradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" style="stop-color:#9c27b0;stop-opacity:1" />
              <stop offset="100%" style="stop-color:#7b1fa2;stop-opacity:1" />
            </linearGradient>
          </defs>
          
          <!-- Grid Background -->
          <rect width="100%" height="100%" fill="url(#grid)" opacity="0.3"/>
          
          <!-- Connections -->
          <g class="connections-layer">
            <path 
              *ngFor="let connection of layout.connections; trackBy: trackConnection"
              [attr.d]="getConnectionPath(connection)"
              [class]="'connection connection-' + connection.type"
              [attr.marker-end]="'url(#arrow-' + connection.type + ')'"
              (click)="onConnectionClick(connection)">
            </path>
          </g>
          
          <!-- Connection Arrows -->
          <defs>
            <marker id="arrow-property" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#666"/>
            </marker>
            <marker id="arrow-array" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#34a853"/>
            </marker>
            <marker id="arrow-reference" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L0,6 L9,3 z" fill="#ea4335"/>
            </marker>
          </defs>
          
          <!-- Nodes -->
          <g class="nodes-layer">
            <g 
              *ngFor="let node of layout.nodes; trackBy: trackNode"
              class="node-group"
              [attr.transform]="'translate(' + node.x + ',' + node.y + ')'"
              (click)="onNodeClick(node)"
              (mouseenter)="onNodeHover(node)"
              (mouseleave)="onNodeLeave(node)">
              
              <!-- Node Background -->
              <rect 
                class="node-background"
                [class]="'node-type-' + node.type.toLowerCase()"
                [attr.width]="node.width"
                [attr.height]="node.height"
                [attr.fill]="getNodeFill(node)"
                rx="8" 
                ry="8"
                [attr.stroke]="getNodeStroke(node)"
                stroke-width="2">
              </rect>
              
              <!-- Required Indicator -->
              <circle 
                *ngIf="node.required"
                class="required-indicator"
                cx="8" 
                cy="8" 
                r="4"
                fill="#ea4335">
              </circle>
              
              <!-- Type Badge -->
              <rect 
                class="type-badge"
                x="0" 
                y="0" 
                width="30" 
                height="20"
                [attr.fill]="getTypeBadgeColor(node.type)"
                rx="4">
              </rect>
              <text 
                class="type-text"
                x="15" 
                y="14" 
                text-anchor="middle"
                fill="white"
                font-size="10"
                font-weight="bold">
                {{ getTypeAbbreviation(node.type) }}
              </text>
              
              <!-- Node Name -->
              <text 
                class="node-name"
                x="40" 
                y="18"
                font-size="14"
                font-weight="600"
                [attr.fill]="getTextColor()">
                {{ node.name }}
              </text>
              
              <!-- Node Title -->
              <text 
                *ngIf="node.title"
                class="node-title"
                x="40" 
                y="35"
                font-size="11"
                opacity="0.8"
                [attr.fill]="getTextColor()">
                {{ node.title }}
              </text>
              
              <!-- Children Count -->
              <text 
                *ngIf="node.children.length > 0"
                class="children-count"
                [attr.x]="node.width - 15"
                y="18"
                text-anchor="middle"
                font-size="12"
                font-weight="bold"
                fill="#666">
                {{ node.children.length }}
              </text>
            </g>
          </g>
          
          <!-- Selection Box -->
          <rect 
            *ngIf="selectedNode"
            class="selection-box"
            [attr.x]="selectedNode.x - 2"
            [attr.y]="selectedNode.y - 2"
            [attr.width]="selectedNode.width + 4"
            [attr.height]="selectedNode.height + 4"
            fill="none"
            stroke="#4285f4"
            stroke-width="3"
            stroke-dasharray="5,5"
            rx="10"
            opacity="0.8">
            <animate attributeName="stroke-dashoffset" values="0;10" dur="1s" repeatCount="indefinite"/>
          </rect>
        </svg>
        
        <!-- Zoom Level Indicator -->
        <div class="zoom-indicator">
          {{ MathRef.round(zoomLevel * 100) }}%
        </div>
      </div>
      
      <!-- Node Inspector -->
      <div class="node-inspector" *ngIf="selectedNode">
        <div class="inspector-header">
          <h4>{{ selectedNode.name }}</h4>
          <button class="btn btn-sm" (click)="closeInspector()">×</button>
        </div>
        <div class="inspector-content">
          <div class="property-row">
            <span class="label">Type:</span>
            <span class="value">{{ selectedNode.type }}</span>
          </div>
          <div class="property-row" *ngIf="selectedNode.title">
            <span class="label">Title:</span>
            <span class="value">{{ selectedNode.title }}</span>
          </div>
          <div class="property-row">
            <span class="label">Required:</span>
            <span class="value">{{ selectedNode.required ? 'Yes' : 'No' }}</span>
          </div>
          <div class="property-row">
            <span class="label">Children:</span>
            <span class="value">{{ selectedNode.children.length }}</span>
          </div>
          <div class="property-row">
            <span class="label">Level:</span>
            <span class="value">{{ selectedNode.level }}</span>
          </div>
        </div>
      </div>
    </div>
  `,
  styleUrl: './schema-diagram.component.scss'
})
export class SchemaDiagramComponent implements OnInit, OnChanges {
  @Input() schema: JsonSchema | null = null;
  @ViewChild('svgElement') svgElement!: ElementRef<SVGElement>;
  @ViewChild('viewport') viewport!: ElementRef<HTMLDivElement>;

  // Make Math available in template
  MathRef = Math;

  // Make Math available in template
  Math = Math;

  layout: DiagramLayout = { nodes: [], connections: [], bounds: { width: 800, height: 600 } };
  selectedNode: DiagramNode | null = null;
  selectedLayout: string = 'hierarchical';
  selectedTheme: string = 'default';
  
  // Viewport properties
  svgWidth = 800;
  svgHeight = 600;
  viewBox = '0 0 800 600';
  zoomLevel = 1;
  panX = 0;
  panY = 0;
  
  // Interaction state
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartPanX = 0;
  private dragStartPanY = 0;

  ngOnInit(): void {
    this.updateViewport();
    this.generateDiagram();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['schema'] && this.schema) {
      this.generateDiagram();
    }
  }

  private updateViewport(): void {
    if (this.viewport) {
      const rect = this.viewport.nativeElement.getBoundingClientRect();
      this.svgWidth = rect.width;
      this.svgHeight = rect.height;
      this.updateViewBox();
    }
  }

  private updateViewBox(): void {
    const centerX = this.svgWidth / 2;
    const centerY = this.svgHeight / 2;
    const width = this.svgWidth / this.zoomLevel;
    const height = this.svgHeight / this.zoomLevel;
    
    this.viewBox = `${centerX - width / 2 + this.panX} ${centerY - height / 2 + this.panY} ${width} ${height}`;
  }

  generateDiagram(): void {
    if (!this.schema) return;
    
    this.layout = this.createLayoutFromSchema(this.schema);
    this.applyLayoutAlgorithm();
  }

  private createLayoutFromSchema(schema: JsonSchema): DiagramLayout {
    const nodes: DiagramNode[] = [];
    const connections: DiagramConnection[] = [];
    
    // Create root node
    const rootNode: DiagramNode = {
      id: 'root',
      x: 0,
      y: 0,
      width: Math.max(150, (schema.title?.length || 10) * 8),
      height: 60,
      type: PropertyType.OBJECT,
      name: schema.title || 'Schema',
      title: schema.description,
      required: true,
      children: [],
      level: 0
    };
    nodes.push(rootNode);
    
    // Process properties recursively
    if (schema.properties) {
      this.processProperties(schema.properties, 'root', 1, nodes, connections);
    }
    
    return {
      nodes,
      connections,
      bounds: { width: 800, height: 600 }
    };
  }

  private processProperties(
    properties: { [key: string]: any }, 
    parentId: string, 
    level: number, 
    nodes: DiagramNode[], 
    connections: DiagramConnection[]
  ): void {
    Object.entries(properties).forEach(([name, prop]) => {
      const nodeId = `${parentId}_${name}`;
      const node: DiagramNode = {
        id: nodeId,
        x: 0,
        y: 0,
        width: Math.max(120, name.length * 8),
        height: prop.title ? 50 : 35,
        type: prop.type || PropertyType.STRING,
        name,
        title: prop.title,
        required: prop.required || false,
        children: [],
        parent: parentId,
        level
      };
      
      nodes.push(node);
      
      // Add connection to parent
      connections.push({
        from: parentId,
        to: nodeId,
        type: 'property'
      });
      
      // Update parent's children
      const parent = nodes.find(n => n.id === parentId);
      if (parent) {
        parent.children.push(nodeId);
      }
      
      // Process nested properties
      if (prop.type === PropertyType.OBJECT && prop.properties) {
        this.processProperties(prop.properties, nodeId, level + 1, nodes, connections);
      }
      
      if (prop.type === PropertyType.ARRAY && prop.items) {
        const itemNodeId = `${nodeId}_items`;
        const itemNode: DiagramNode = {
          id: itemNodeId,
          x: 0,
          y: 0,
          width: 100,
          height: 35,
          type: prop.items.type || PropertyType.STRING,
          name: 'items',
          title: prop.items.title,
          required: false,
          children: [],
          parent: nodeId,
          level: level + 1
        };
        
        nodes.push(itemNode);
        node.children.push(itemNodeId);
        
        connections.push({
          from: nodeId,
          to: itemNodeId,
          type: 'array'
        });
        
        if (prop.items.type === PropertyType.OBJECT && prop.items.properties) {
          this.processProperties(prop.items.properties, itemNodeId, level + 2, nodes, connections);
        }
      }
    });
  }

  private applyLayoutAlgorithm(): void {
    switch (this.selectedLayout) {
      case 'hierarchical':
        this.applyHierarchicalLayout();
        break;
      case 'radial':
        this.applyRadialLayout();
        break;
      case 'force':
        this.applyForceDirectedLayout();
        break;
    }
    
    this.calculateBounds();
  }

  private applyHierarchicalLayout(): void {
    const levelWidth = 200;
    const nodeSpacing = 80;
    const levelNodes: { [level: number]: DiagramNode[] } = {};
    
    // Group nodes by level
    this.layout.nodes.forEach(node => {
      if (!levelNodes[node.level]) {
        levelNodes[node.level] = [];
      }
      levelNodes[node.level].push(node);
    });
    
    // Position nodes
    Object.entries(levelNodes).forEach(([level, nodes]) => {
      const levelNum = parseInt(level);
      const startY = -(nodes.length * nodeSpacing) / 2;
      
      nodes.forEach((node, index) => {
        node.x = levelNum * levelWidth;
        node.y = startY + (index * nodeSpacing);
      });
    });
  }

  private applyRadialLayout(): void {
    const centerX = 0;
    const centerY = 0;
    const radiusStep = 150;
    
    const rootNode = this.layout.nodes.find(n => n.id === 'root');
    if (rootNode) {
      rootNode.x = centerX;
      rootNode.y = centerY;
    }
    
    // Position nodes in concentric circles
    const levelNodes: { [level: number]: DiagramNode[] } = {};
    this.layout.nodes.forEach(node => {
      if (node.level > 0) {
        if (!levelNodes[node.level]) {
          levelNodes[node.level] = [];
        }
        levelNodes[node.level].push(node);
      }
    });
    
    Object.entries(levelNodes).forEach(([level, nodes]) => {
      const levelNum = parseInt(level);
      const radius = levelNum * radiusStep;
      const angleStep = (2 * Math.PI) / nodes.length;
      
      nodes.forEach((node, index) => {
        const angle = index * angleStep;
        node.x = centerX + radius * Math.cos(angle);
        node.y = centerY + radius * Math.sin(angle);
      });
    });
  }

  private applyForceDirectedLayout(): void {
    // Simple force-directed layout simulation
    const iterations = 50;
    const repulsion = 5000;
    const attraction = 0.1;
    const damping = 0.85;
    
    // Initialize velocities
    const velocities = new Map<string, {vx: number, vy: number}>();
    this.layout.nodes.forEach(node => {
      velocities.set(node.id, { vx: 0, vy: 0 });
    });
    
    for (let iter = 0; iter < iterations; iter++) {
      // Calculate forces
      this.layout.nodes.forEach(node => {
        const vel = velocities.get(node.id)!;
        let fx = 0, fy = 0;
        
        // Repulsion between all nodes
        this.layout.nodes.forEach(other => {
          if (node.id !== other.id) {
            const dx = node.x - other.x;
            const dy = node.y - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const force = repulsion / (dist * dist);
            fx += (dx / dist) * force;
            fy += (dy / dist) * force;
          }
        });
        
        // Attraction along connections
        this.layout.connections.forEach(conn => {
          if (conn.from === node.id) {
            const target = this.layout.nodes.find(n => n.id === conn.to)!;
            const dx = target.x - node.x;
            const dy = target.y - node.y;
            fx += dx * attraction;
            fy += dy * attraction;
          } else if (conn.to === node.id) {
            const source = this.layout.nodes.find(n => n.id === conn.from)!;
            const dx = source.x - node.x;
            const dy = source.y - node.y;
            fx += dx * attraction;
            fy += dy * attraction;
          }
        });
        
        vel.vx = (vel.vx + fx) * damping;
        vel.vy = (vel.vy + fy) * damping;
      });
      
      // Apply velocities
      this.layout.nodes.forEach(node => {
        const vel = velocities.get(node.id)!;
        node.x += vel.vx;
        node.y += vel.vy;
      });
    }
  }

  private calculateBounds(): void {
    if (this.layout.nodes.length === 0) return;
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    this.layout.nodes.forEach(node => {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    });
    
    this.layout.bounds = {
      width: maxX - minX + 100,
      height: maxY - minY + 100
    };
  }

  // Event handlers and utility methods
  onMouseDown(event: MouseEvent): void {
    this.isDragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.dragStartPanX = this.panX;
    this.dragStartPanY = this.panY;
  }

  onMouseMove(event: MouseEvent): void {
    if (this.isDragging) {
      const dx = (event.clientX - this.dragStartX) / this.zoomLevel;
      const dy = (event.clientY - this.dragStartY) / this.zoomLevel;
      this.panX = this.dragStartPanX - dx;
      this.panY = this.dragStartPanY - dy;
      this.updateViewBox();
    }
  }

  onMouseUp(): void {
    this.isDragging = false;
  }

  onWheel(event: WheelEvent): void {
    event.preventDefault();
    const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1;
    this.zoomLevel = Math.max(0.1, Math.min(5, this.zoomLevel * zoomFactor));
    this.updateViewBox();
  }

  onNodeClick(node: DiagramNode): void {
    this.selectedNode = node;
  }

  onNodeHover(node: DiagramNode): void {
    // Add hover effects
  }

  onNodeLeave(node: DiagramNode): void {
    // Remove hover effects
  }

  onConnectionClick(connection: DiagramConnection): void {
    // Handle connection selection
  }

  closeInspector(): void {
    this.selectedNode = null;
  }

  zoomIn(): void {
    this.zoomLevel = Math.min(5, this.zoomLevel * 1.2);
    this.updateViewBox();
  }

  zoomOut(): void {
    this.zoomLevel = Math.max(0.1, this.zoomLevel / 1.2);
    this.updateViewBox();
  }

  resetZoom(): void {
    this.zoomLevel = 1;
    this.panX = 0;
    this.panY = 0;
    this.updateViewBox();
  }

  centerDiagram(): void {
    this.panX = 0;
    this.panY = 0;
    this.updateViewBox();
  }

  updateLayout(): void {
    this.applyLayoutAlgorithm();
  }

  updateTheme(): void {
    // Update theme classes
  }

  normalizeDiagram(): void {
    // Apply automatic normalization
    this.applyLayoutAlgorithm();
    this.centerDiagram();
  }

  exportSVG(): void {
    if (!this.svgElement) return;
    
    const svgData = this.svgElement.nativeElement.outerHTML;
    const blob = new Blob([svgData], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'schema-diagram.svg';
    link.click();
    URL.revokeObjectURL(url);
  }

  // Utility methods for rendering
  getConnectionPath(connection: DiagramConnection): string {
    const from = this.layout.nodes.find(n => n.id === connection.from);
    const to = this.layout.nodes.find(n => n.id === connection.to);
    
    if (!from || !to) return '';
    
    const fromX = from.x + from.width;
    const fromY = from.y + from.height / 2;
    const toX = to.x;
    const toY = to.y + to.height / 2;
    
    // Curved connection
    const midX = (fromX + toX) / 2;
    return `M ${fromX} ${fromY} Q ${midX} ${fromY} ${midX} ${(fromY + toY) / 2} Q ${midX} ${toY} ${toX} ${toY}`;
  }

  getNodeFill(node: DiagramNode): string {
    switch (node.type) {
      case PropertyType.OBJECT: return 'url(#objectGradient)';
      case PropertyType.ARRAY: return 'url(#arrayGradient)';
      case PropertyType.STRING: return 'url(#stringGradient)';
      case PropertyType.NUMBER: return 'url(#numberGradient)';
      case PropertyType.INTEGER: return 'url(#numberGradient)';
      case PropertyType.BOOLEAN: return '#607d8b';
      default: return '#9e9e9e';
    }
  }

  getNodeStroke(node: DiagramNode): string {
    return node.required ? '#ea4335' : '#ddd';
  }

  getTypeBadgeColor(type: PropertyType): string {
    switch (type) {
      case PropertyType.OBJECT: return '#4285f4';
      case PropertyType.ARRAY: return '#34a853';
      case PropertyType.STRING: return '#ff9800';
      case PropertyType.NUMBER:
      case PropertyType.INTEGER: return '#9c27b0';
      case PropertyType.BOOLEAN: return '#607d8b';
      default: return '#9e9e9e';
    }
  }

  getTypeAbbreviation(type: PropertyType): string {
    switch (type) {
      case PropertyType.OBJECT: return 'OBJ';
      case PropertyType.ARRAY: return 'ARR';
      case PropertyType.STRING: return 'STR';
      case PropertyType.NUMBER: return 'NUM';
      case PropertyType.INTEGER: return 'INT';
      case PropertyType.BOOLEAN: return 'BOL';
      default: return '?';
    }
  }

  getTextColor(): string {
    return this.selectedTheme === 'dark' ? '#fff' : '#333';
  }

  trackNode(index: number, node: DiagramNode): string {
    return node.id;
  }

  trackConnection(index: number, connection: DiagramConnection): string {
    return `${connection.from}-${connection.to}`;
  }
}