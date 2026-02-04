import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { vannaDesignTokens } from '../styles/vanna-design-tokens.js';

@customElement('vanna-message')
export class VannaMessage extends LitElement {
  static styles = [
    vannaDesignTokens,
    css`
      :host {
        display: block;
        padding: 0 var(--vanna-space-2);
        margin-bottom: var(--vanna-space-4);
        font-family: var(--vanna-font-family-default);
        animation: fade-in-up 0.25s ease-out;
      }

      :host(:last-of-type) {
        margin-bottom: 0;
      }

      @keyframes fade-in-up {
        from {
          opacity: 0;
          transform: translateY(16px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .message {
        position: relative;
        padding: var(--vanna-space-3) var(--vanna-space-4);
        border-radius: var(--vanna-chat-bubble-radius);
        word-wrap: break-word;
        line-height: 1.6;
        display: flex;
        flex-direction: column;
        gap: var(--vanna-space-2);
        max-width: min(85%, 580px);
        transition: transform var(--vanna-duration-200) ease, box-shadow var(--vanna-duration-200) ease;
      }

      .message.assistant {
        background: var(--vanna-background-root);
        border: 1px solid var(--vanna-outline-dimmer);
        color: var(--vanna-foreground-default);
        box-shadow: var(--vanna-shadow-xs);
        border-radius: var(--vanna-chat-bubble-radius) var(--vanna-chat-bubble-radius) var(--vanna-chat-bubble-radius) var(--vanna-space-1);
      }

      .message.user {
        margin-left: auto;
        max-width: min(80%, 500px);
        background: var(--vanna-accent-primary-default);
        color: white;
        box-shadow: var(--vanna-shadow-sm);
        border-radius: var(--vanna-chat-bubble-radius) var(--vanna-chat-bubble-radius) var(--vanna-space-1) var(--vanna-chat-bubble-radius);
      }

      .message:hover {
        transform: none;
      }

      .message.assistant:hover {
        box-shadow: var(--vanna-shadow-sm);
        border-color: var(--vanna-accent-primary-default);
      }

      .message.user:hover {
        box-shadow: var(--vanna-shadow-md);
        opacity: 0.95;
      }

      .message-content {
        margin: 0;
        font-size: 15px;
        letter-spacing: 0.01em;
        white-space: pre-wrap;
        font-weight: 400;
      }

      .copy-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 6px;
        border: 1px solid transparent;
        background: transparent;
        color: var(--vanna-foreground-dimmer);
        cursor: pointer;
        transition: border-color var(--vanna-duration-150) ease, background var(--vanna-duration-150) ease, color var(--vanna-duration-150) ease;
      }

      .copy-button svg {
        width: 14px;
        height: 14px;
      }

      .copy-button:hover {
        border-color: var(--vanna-outline-dimmer);
        background: var(--vanna-background-higher);
        color: var(--vanna-foreground-default);
      }

      .message-content a {
        color: inherit;
        font-weight: 500;
        text-decoration: underline;
        text-decoration-thickness: 1px;
        text-underline-offset: 2px;
        opacity: 0.9;
      }

      .message-content code {
        font-family: var(--vanna-font-family-mono);
        background: var(--vanna-background-higher);
        padding: 2px 5px;
        border-radius: var(--vanna-border-radius-sm);
        font-size: 13px;
        border: 1px solid var(--vanna-outline-dimmest);
      }

      .message.user .message-content code {
        background: rgba(255, 255, 255, 0.2);
        border-color: rgba(255, 255, 255, 0.3);
      }

      .message-timestamp {
        display: inline-flex;
        align-items: center;
        gap: var(--vanna-space-1);
        font-size: 11px;
        letter-spacing: 0.05em;
        margin-top: var(--vanna-space-2);
        font-family: var(--vanna-font-family-default);
        opacity: 0.7;
        font-weight: 500;
      }

      .message-timestamp::before {
        content: '';
        width: 3px;
        height: 3px;
        border-radius: var(--vanna-border-radius-full);
        background: currentColor;
        opacity: 0.8;
      }

      .message.assistant .message-timestamp {
        align-self: flex-start;
        color: var(--vanna-foreground-dimmest);
      }

      .message.assistant .message-timestamp::before {
        background: var(--vanna-accent-primary-default);
      }

      .message.user .message-timestamp {
        align-self: flex-end;
        color: rgba(255, 255, 255, 0.8);
      }

      .message.user .message-timestamp::before {
        background: rgba(255, 255, 255, 0.8);
      }

      :host([theme="dark"]) .message.assistant {
        background: var(--vanna-background-higher);
        border: 1px solid var(--vanna-outline-default);
        color: var(--vanna-foreground-default);
        box-shadow: var(--vanna-shadow-md);
      }

      :host([theme="dark"]) .message.assistant .message-content code {
        background: var(--vanna-background-highest);
        border-color: var(--vanna-outline-default);
      }

      :host([theme="dark"]) .message.assistant .message-timestamp {
        color: var(--vanna-foreground-dimmest);
      }

      :host([theme="dark"]) .message.assistant .message-timestamp::before {
        background: var(--vanna-accent-primary-default);
      }

      :host([theme="dark"]) .message.user {
        background: linear-gradient(135deg, var(--vanna-accent-primary-stronger) 0%, var(--vanna-accent-primary-default) 100%);
        color: white;
        box-shadow: var(--vanna-shadow-lg);
      }

      :host([theme="dark"]) .message.user .message-content code {
        background: rgba(255, 255, 255, 0.15);
        border-color: rgba(255, 255, 255, 0.25);
      }

      :host([theme="dark"]) .message.user .message-timestamp {
        color: rgba(255, 255, 255, 0.8);
      }

      :host([theme="dark"]) .message.user .message-timestamp::before {
        background: rgba(255, 255, 255, 0.8);
      }

      @media (max-width: 600px) {
        .message {
          max-width: 100%;
        }

        .message.user {
          max-width: 100%;
        }
      }
    `
  ];

  @property() content = '';
  @property() type: 'user' | 'assistant' = 'user';
  @property({ type: Number }) timestamp = Date.now();
  @property({ reflect: true }) theme = 'light';
  @state() private copied = false;
  private copyTimer: number | undefined;

  private async handleCopy() {
    const text = this.content || '';
    try {
      await navigator.clipboard.writeText(text);
    } catch (error) {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(textarea);
      }
    }

    this.copied = true;
    if (this.copyTimer) {
      window.clearTimeout(this.copyTimer);
    }
    this.copyTimer = window.setTimeout(() => {
      this.copied = false;
    }, 2000);
  }

  private formatTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  render() {
    return html`
      <div class="message ${this.type}">
        <div class="message-content">${this.content}</div>
        <div class="message-timestamp">
          ${this.type === 'assistant' ? html`
            <button class="copy-button" type="button" @click=${this.handleCopy} aria-label="Copy response">
              ${this.copied ? html`
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M9 16.2l-3.5-3.5L4 14.2l5 5 12-12-1.5-1.5z"/>
                </svg>
              ` : html`
                <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M16 1H6c-1.1 0-2 .9-2 2v12h2V3h10V1zm3 4H10c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h9c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H10V7h9v14z"/>
                </svg>
              `}
            </button>
          ` : ''}
          ${this.formatTimestamp(this.timestamp)}
        </div>
      </div>
    `;
  }
}
