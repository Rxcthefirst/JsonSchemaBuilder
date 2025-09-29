import { Component, Input, OnInit, OnDestroy, ViewChild, ElementRef, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import cytoscape, { Core, ElementDefinition, NodeSingular, EdgeSingular } from 'cytoscape';
import { JsonSchema, SchemaProperty } from '../../models/schema.models';

@Component({
  selector: 'app-cytoscape-diagram',
  imports: [CommonModule],
  template: `
    <div class="cytoscape-container">
      <div class="diagram-controls">
        <button class="control-btn" (click)="fitToView()" title="Fit to View">
          🎯 Fit
        </button>
        <button class="control-btn" (click)="resetZoom()" title="Reset Zoom">
          🔍 Reset Zoom
        </button>
        <button class="control-btn" (click)="changeLayout('breadthfirst')" title="Hierarchical Layout">
          🌳 Tree
        </button>
        <button class="control-btn" (click)="changeLayout('circle')" title="Circular Layout">
          ⭕ Circle
        </button>
        <button class="control-btn" (click)="changeLayout('grid')" title="Grid Layout">
          ⊞ Grid
        </button>
        <button class="control-btn" (click)="changeLayout('cose')" title="Force Layout">
          🌀 Force
        </button>
        <button class="control-btn" (click)="exportPNG()" title="Export PNG">
          🖼️ PNG
        </button>
        <button class="control-btn" (click)="exportSVG()" title="Export SVG">
          📄 SVG
        </button>
      </div>
      <div #cytoscapeContainer class="cytoscape-graph"></div>
      <div class="diagram-info" *ngIf="selectedNode">
        <h4>{{ selectedNode.name }}</h4>
        <p><strong>Type:</strong> {{ selectedNode.type }}</p>
        <p *ngIf="selectedNode.description"><strong>Description:</strong> {{ selectedNode.description }}</p>
        <p *ngIf="selectedNode.required !== undefined"><strong>Required:</strong> {{ selectedNode.required ? 'Yes' : 'No' }}</p>
      </div>
    </div>
  `,
  styleUrl: './cytoscape-diagram.component.scss'
})
export class CytoscapeDiagramComponent implements OnInit, OnDestroy, OnChanges {
  @Input() schema: JsonSchema | null = null;
  @ViewChild('cytoscapeContainer', { static: true }) container!: ElementRef;
  
  private cy: Core | null = null;
  selectedNode: any = null;

  ngOnInit(): void {
    this.initializeCytoscape();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['schema'] && this.cy) {
      this.updateDiagram();
    }
  }

  ngOnDestroy(): void {
    if (this.cy) {
      this.cy.destroy();
    }
  }

  private initializeCytoscape(): void {
    this.cy = cytoscape({
      container: this.container.nativeElement,
      
      style: [
        {
          selector: 'node',
          style: {
            'background-color': '#667eea',
            'label': 'data(label)',
            'text-valign': 'center',
            'text-halign': 'center',
            'color': 'white',
            'font-size': '12px',
            'font-weight': 'bold',
            'width': '60px',
            'height': '60px',
            'border-width': 2,
            'border-color': '#4c63d2'
          }
        },
        {
          selector: 'node[type="string"]',
          style: {
            'background-color': '#28a745',
            'border-color': '#1e7e34'
          }
        },
        {
          selector: 'node[type="number"]',
          style: {
            'background-color': '#dc3545',
            'border-color': '#c82333'
          }
        },
        {
          selector: 'node[type="boolean"]',
          style: {
            'background-color': '#ffc107',
            'border-color': '#e0a800'
          }
        },
        {
          selector: 'node[type="array"]',
          style: {
            'background-color': '#fd7e14',
            'border-color': '#e85d04'
          }
        },
        {
          selector: 'node[type="object"]',
          style: {
            'background-color': '#6f42c1',
            'border-color': '#5a359a'
          }
        },
        {
          selector: 'node[type="reference"]',
          style: {
            'background-color': '#fd7e14',
            'border-color': '#dc6502',
            'shape': 'diamond'
          }
        },
        {
          selector: 'node[type="circular-reference"]',
          style: {
            'background-color': '#dc3545',
            'border-color': '#bd2130',
            'shape': 'triangle',
            'border-width': 3
          }
        },
        {
          selector: 'node[?ref]',
          style: {
            'border-width': 3,
            'border-style': 'dashed'
          }
        },
        {
          selector: 'node[required="true"]',
          style: {
            'border-width': 4,
            'border-style': 'double'
          }
        },
        {
          selector: 'node:selected',
          style: {
            'background-color': '#ff6b6b',
            'border-color': '#ee5a52',
            'border-width': 4
          }
        },
        {
          selector: 'edge',
          style: {
            'width': 2,
            'line-color': '#99a3bd',
            'target-arrow-color': '#99a3bd',
            'target-arrow-shape': 'triangle',
            'curve-style': 'bezier',
            'arrow-scale': 1.2
          }
        },
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#ff6b6b',
            'target-arrow-color': '#ff6b6b',
            'width': 3
          }
        }
      ],

      layout: {
        name: 'breadthfirst',
        directed: true,
        roots: ['root'],
        padding: 20,
        spacingFactor: 1.2
      } as any,

      // Interaction options
      minZoom: 0.1,
      maxZoom: 3,
      wheelSensitivity: 0.1
    });

    // Event handlers
    this.cy.on('tap', 'node', (event) => {
      const node = event.target;
      this.selectedNode = {
        name: node.data('label'),
        type: node.data('type'),
        description: node.data('description'),
        required: node.data('required')
      };
    });

    this.cy.on('tap', (event) => {
      if (event.target === this.cy) {
        this.selectedNode = null;
      }
    });

    this.updateDiagram();
  }

  private updateDiagram(): void {
    if (!this.cy || !this.schema) {
      return;
    }

    const elements: ElementDefinition[] = [];
    const nodeIdCounter = { value: 0 };

    // Add root node
    const rootId = 'root';
    elements.push({
      data: {
        id: rootId,
        label: this.schema.title || 'Schema',
        type: 'object',
        description: this.schema.description,
        required: false
      }
    });

    // Process schema properties
    if (this.schema.properties) {
      this.addPropertiesNodes(elements, this.schema.properties, rootId, nodeIdCounter, this.schema.required || []);
    }

    this.cy.elements().remove();
    this.cy.add(elements);
    this.cy.layout({ 
      name: 'breadthfirst',
      directed: true,
      roots: ['root'],
      padding: 20,
      spacingFactor: 1.2
    } as any).run();
  }

  private resolveRef(ref: string, visited: Set<string> = new Set()): any {
    // Prevent circular references
    if (visited.has(ref)) {
      return {
        type: 'circular-reference',
        description: `Circular reference to ${ref}`
      };
    }
    
    visited.add(ref);
    
    // Handle local references (#/definitions/...)
    if (ref.startsWith('#/definitions/')) {
      const definitionName = ref.replace('#/definitions/', '');
      const definition = this.schema?.definitions?.[definitionName];
      
      if (definition) {
        // If the resolved definition has its own $ref, resolve that too
        if (definition.$ref) {
          return this.resolveRef(definition.$ref, visited);
        }
        return definition;
      }
    }
    
    // Handle other reference patterns if needed in future
    return null;
  }

  private addPropertiesNodes(
    elements: ElementDefinition[], 
    properties: { [key: string]: any }, 
    parentId: string, 
    nodeIdCounter: { value: number },
    requiredProps: string[] = []
  ): void {
    Object.keys(properties).forEach(propName => {
      let prop = properties[propName];
      
      // Handle $ref patterns
      if (prop.$ref) {
        console.log(`Resolving $ref: ${prop.$ref}`, this.schema?.definitions);
        const resolvedProp = this.resolveRef(prop.$ref);
        if (resolvedProp) {
          // Use resolved definition but keep the original property name
          prop = { ...resolvedProp, originalRef: prop.$ref };
          console.log(`Resolved to:`, prop);
        } else {
          // If we can't resolve the reference, show a reference node
          prop = {
            type: 'reference',
            $ref: prop.$ref,
            description: `Reference to ${prop.$ref}`
          };
          console.log(`Could not resolve ${prop.$ref}, showing reference node`);
        }
      }
      
      const nodeId = `node_${nodeIdCounter.value++}`;
      const isRequired = requiredProps.includes(propName);
      const nodeType = prop.type || 'object';

      // Add property node
      elements.push({
        data: {
          id: nodeId,
          label: propName,
          type: nodeType,
          description: prop.description,
          required: isRequired,
          ref: prop.$ref || prop.originalRef // Keep reference info for styling
        }
      });

      // Add edge from parent to this node
      elements.push({
        data: {
          id: `edge_${parentId}_${nodeId}`,
          source: parentId,
          target: nodeId
        }
      });

      // Recursively add child properties for object types
      if (nodeType === 'object' && prop.properties) {
        this.addPropertiesNodes(elements, prop.properties, nodeId, nodeIdCounter, prop.required || []);
      }

      // Handle array items (including $ref in items)
      if (nodeType === 'array' && prop.items) {
        let arrayItem = prop.items;
        
        // Resolve $ref in array items
        if (arrayItem.$ref) {
          const resolvedItem = this.resolveRef(arrayItem.$ref);
          if (resolvedItem) {
            arrayItem = { ...resolvedItem, originalRef: arrayItem.$ref };
          }
        }
        
        const itemNodeId = `node_${nodeIdCounter.value++}`;
        const itemType = arrayItem.type || 'object';
        
        elements.push({
          data: {
            id: itemNodeId,
            label: `[${itemType}]`,
            type: itemType,
            description: arrayItem.description,
            required: false,
            ref: arrayItem.$ref || arrayItem.originalRef
          }
        });

        elements.push({
          data: {
            id: `edge_${nodeId}_${itemNodeId}`,
            source: nodeId,
            target: itemNodeId
          }
        });

        // If array items are objects with properties
        if (itemType === 'object' && arrayItem.properties) {
          this.addPropertiesNodes(elements, arrayItem.properties, itemNodeId, nodeIdCounter, arrayItem.required || []);
        }
      }
    });
  }

  fitToView(): void {
    this.cy?.fit(undefined, 20);
  }

  resetZoom(): void {
    this.cy?.zoom(1);
    this.cy?.center();
  }

  changeLayout(layoutName: string): void {
    if (!this.cy) return;

    const layoutOptions: any = {
      name: layoutName,
      padding: 20,
      animate: true,
      animationDuration: 500
    };

    if (layoutName === 'breadthfirst') {
      layoutOptions.directed = true;
      layoutOptions.roots = ['root'];
      layoutOptions.spacingFactor = 1.2;
    } else if (layoutName === 'cose') {
      layoutOptions.idealEdgeLength = 100;
      layoutOptions.nodeOverlap = 20;
      layoutOptions.refresh = 20;
      layoutOptions.fit = true;
      layoutOptions.padding = 30;
      layoutOptions.randomize = false;
    } else if (layoutName === 'circle') {
      layoutOptions.radius = 200;
    }

    this.cy.layout(layoutOptions).run();
  }

  exportPNG(): void {
    if (!this.cy) return;
    
    const pngBlob = this.cy.png({
      output: 'blob-promise',
      full: true,
      scale: 2
    });

    pngBlob.then((blob: Blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'schema-diagram.png';
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  exportSVG(): void {
    // SVG export requires additional cytoscape extension
    console.log('SVG export would require cytoscape-svg extension');
    alert('SVG export requires additional setup. PNG export is available.');
  }
}