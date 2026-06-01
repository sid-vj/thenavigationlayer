import { render, h } from 'preact';
import { CommandPalette } from './CommandPalette';
import { ChatWidget } from './ChatWidget';
import { ChatRuntime } from '../types';
import { Logger } from '../utils/logger';

export class UIManager {
    private shadowRoot: ShadowRoot | null = null;
    private hostElement: HTMLElement | null = null;
    private runtime: ChatRuntime;

    constructor(runtime: ChatRuntime) {
        this.runtime = runtime;
    }

    public mount() {
        if (this.hostElement) return;

        // Create Host
        this.hostElement = document.createElement('div');
        this.hostElement.id = 'thias-sdk-root';
        this.hostElement.style.position = 'fixed';
        this.hostElement.style.zIndex = '2147483647';
        this.hostElement.style.top = '0';
        this.hostElement.style.left = '0';
        this.hostElement.style.width = '0';
        this.hostElement.style.height = '0';
        document.body.appendChild(this.hostElement);

        // Attach Shadow DOM
        this.shadowRoot = this.hostElement.attachShadow({ mode: 'open' });

        // Inject Styles (Tailwind or custom CSS)
        const style = document.createElement('style');
        style.textContent = `
          :host { all: initial; }
          .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; backdrop-filter: blur(4px); }
          .panel { background: #18181B; color: white; border: 1px solid #3F3F46; border-radius: 12px; width: 600px; max-width: 90vw; padding: 16px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04); font-family: system-ui, sans-serif; }
          .input { width: 100%; background: transparent; border: none; font-size: 18px; color: white; outline: none; padding: 8px 0; }
          .hidden { display: none; }
          
          /* --- Markdown Typography --- */
          .thias-md-content { 
            font-family: inherit; 
            line-height: 1.6; 
            font-size: 14.5px;
            color: inherit; 
          }
          .thias-md-content > :first-child { margin-top: 0; }
          .thias-md-content > :last-child { margin-bottom: 0; }
          
          /* Paragraphs & Headings */
          .thias-md-content p { margin-top: 0; margin-bottom: 0.75em; }
          .thias-md-content h1, .thias-md-content h2, .thias-md-content h3, .thias-md-content h4 { 
            font-weight: 600; 
            margin-top: 1.5em; 
            margin-bottom: 0.5em; 
            line-height: 1.3;
          }
          
          /* Strong & Emphasis */
          .thias-md-content strong, .thias-md-content b { font-weight: 600; color: inherit; }
          .thias-md-content em, .thias-md-content i { font-style: italic; }
          
          /* Lists */
          .thias-md-content ul { 
            list-style-type: disc; 
            padding-left: 1.25em; 
            margin-top: 0.5em; 
            margin-bottom: 0.75em; 
          }
          .thias-md-content ol { 
            list-style-type: decimal; 
            padding-left: 1.25em; 
            margin-top: 0.5em; 
            margin-bottom: 0.75em; 
          }
          .thias-md-content li { margin-top: 0.25em; margin-bottom: 0.25em; padding-left: 0.25em; }
          .thias-md-content li > p { margin-top: 0; margin-bottom: 0.25em; }
          
          /* Code blocks & Inline Code */
          .thias-md-content code { 
            font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
            font-size: 0.875em;
            padding: 0.15em 0.3em; 
            border-radius: 0.25rem; 
            background-color: rgba(0, 0, 0, 0.05); /* Assuming light theme context mostly, or adjust later */
            color: #ef4444; /* Subtle red often used in GitHub markdown for inline code */
          }
          .thias-md-content pre { 
            background-color: #1e293b; 
            color: #f8fafc; 
            overflow-x: auto; 
            border-radius: 0.375rem; 
            padding: 0.75em 1em; 
            margin-top: 0.75em; 
            margin-bottom: 1em; 
          }
          .thias-md-content pre code { 
            background-color: transparent; 
            padding: 0; 
            color: inherit; 
            font-size: 0.875em;
            border-radius: 0;
          }
          
          /* Links */
          .thias-md-content a { color: #2563eb; text-decoration: underline; text-underline-offset: 2px; }
          .thias-md-content a:hover { color: #1d4ed8; }
        `;
        this.shadowRoot.appendChild(style);

        // Render Preact Component
        const container = document.createElement('div');
        this.shadowRoot.appendChild(container);

        render(h(ChatWidget, { runtime: this.runtime }), container);

        Logger.log('[UIManager] Mounted Shadow DOM UI');
    }
}
