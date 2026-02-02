import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { vannaDesignTokens } from '../styles/vanna-design-tokens.js';

interface SchemaTable {
  name: string;
  columns?: Array<{ name: string; type: string }>;
}

interface SchemaData {
  tables: SchemaTable[];
}

@customElement('vanna-schema-explorer')
export class VannaSchemaExplorer extends LitElement {
  static styles = [
    vannaDesignTokens,
    css`
      :host {
        display: block;
        font-family: var(--vanna-font-family-default);
        padding: var(--vanna-space-3);
      }

      .schema-list {
        display: flex;
        flex-direction: column;
        gap: var(--vanna-space-2);
      }

      .table-item {
        padding: var(--vanna-space-2) var(--vanna-space-3);
        border-radius: var(--vanna-border-radius-md);
        background: var(--vanna-background-default);
        border: 1px solid var(--vanna-outline-dimmer);
        font-size: 13px;
        color: var(--vanna-foreground-default);
      }

      .table-name {
        font-weight: 600;
        font-family: var(--vanna-font-family-mono);
      }

      .empty {
        color: var(--vanna-foreground-dimmest);
        font-size: 13px;
        text-align: center;
        padding: var(--vanna-space-6);
      }
    `
  ];

  @property({ type: Object }) schemaData: SchemaData = { tables: [] };
  @property() theme = 'light';
  @property({ type: Boolean }) collapsed = false;

  render() {
    if (!this.schemaData?.tables?.length) {
      return html`<div class="empty">No schema data available</div>`;
    }

    return html`
      <div class="schema-list">
        ${this.schemaData.tables.map(table => html`
          <div class="table-item">
            <span class="table-name">${table.name}</span>
          </div>
        `)}
      </div>
    `;
  }
}
