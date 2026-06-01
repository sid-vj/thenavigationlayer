export interface SnapshotHeading {
    level: string;
    text: string;
}

export interface SnapshotTable {
    columns: string[];
}

export interface SnapshotButton {
    text: string;
    id?: string;
    name?: string;
}

export interface SnapshotLink {
    text: string;
    href: string;
}

export interface SnapshotFormField {
    type: string;
    label: string;
    name?: string;
}

export interface PageSnapshotData {
    route: string;
    title: string;
    headings: SnapshotHeading[];
    tables: SnapshotTable[];
    buttons: SnapshotButton[];
    links: SnapshotLink[];
    formFields: SnapshotFormField[];
    breadcrumbs: string[];
}

export class PageSnapshotGenerator {
    /**
     * Captures a structured JSON snapshot of the current page, avoiding raw HTML.
     */
    public capture(): PageSnapshotData {
        return {
            route: window.location.pathname + window.location.search,
            title: document.title,
            headings: this.extractHeadings(),
            tables: this.extractTables(),
            buttons: this.extractButtons(),
            links: this.extractLinks(),
            formFields: this.extractFormFields(),
            breadcrumbs: this.extractBreadcrumbs(),
        };
    }

    /**
     * Check if an element is visibly rendered on the screen.
     */
    private isVisible(element: HTMLElement): boolean {
        // Fast path for invisible elements
        if (element.offsetWidth === 0 || element.offsetHeight === 0) return false;

        // Element might be visually hidden via CSS text indent or opacity, but
        // checking computed style is expensive. Relying on offsetWidth/Height
        // and standard attributes for now for performance.
        const ariaHidden = element.getAttribute('aria-hidden');
        if (ariaHidden === 'true') return false;

        return true;
    }

    private cleanText(text: string | null | undefined): string {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    private extractHeadings(): SnapshotHeading[] {
        const headings: SnapshotHeading[] = [];
        const elements = document.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');

        for (let i = 0; i < elements.length; i++) {
            if (headings.length >= 20) break; // Limit
            const el = elements[i];
            if (this.isVisible(el)) {
                headings.push({
                    level: el.tagName.toLowerCase(),
                    text: this.cleanText(el.textContent)
                });
            }
        }
        return headings;
    }

    private extractTables(): SnapshotTable[] {
        const tables: SnapshotTable[] = [];
        const elements = document.querySelectorAll<HTMLTableElement>('table');

        for (let i = 0; i < elements.length; i++) {
            if (tables.length >= 5) break; // Limit
            const table = elements[i];
            if (this.isVisible(table)) {
                const headCells = table.querySelectorAll('th');
                const columns = Array.from(headCells)
                    .map(th => this.cleanText(th.textContent))
                    .filter(text => text.length > 0);

                if (columns.length > 0) {
                    tables.push({ columns });
                }
            }
        }
        return tables;
    }

    private extractButtons(): SnapshotButton[] {
        const destructiveKeywords = ['delete', 'remove', 'destroy', 'clear', 'drop'];
        const buttons: SnapshotButton[] = [];

        // Select both actual buttons and role="button"
        const elements = document.querySelectorAll<HTMLElement>('button, [role="button"]');

        for (let i = 0; i < elements.length; i++) {
            if (buttons.length >= 20) break; // Limit
            const el = elements[i];

            if (!this.isVisible(el)) continue;

            // Type check for <button>
            if (el instanceof HTMLButtonElement) {
                if (el.type === 'submit' || el.type === 'reset') {
                    // Usually we don't want to blindly click submit/reset unless we are sure
                    // what form they belong to. Leaving them out for safety unless 
                    // specifically trained to handle forms better.
                    // For now, allow regular submit buttons but warn on destructive ones.
                }
            }

            const text = this.cleanText(el.textContent) || el.getAttribute('aria-label') || '';
            const lowerText = text.toLowerCase();

            // Heuristic to skip destructive actions
            const isDestructive = destructiveKeywords.some(kw => lowerText.includes(kw));
            if (isDestructive) continue;

            if (text) {
                buttons.push({
                    text,
                    ...(el.id ? { id: el.id } : {}),
                    ...('name' in el && typeof el.name === 'string' && el.name ? { name: el.name } : {})
                });
            }
        }
        return buttons;
    }

    private extractLinks(): SnapshotLink[] {
        const links: SnapshotLink[] = [];
        const elements = document.querySelectorAll<HTMLAnchorElement>('a[href]');

        const origin = window.location.origin;

        for (let i = 0; i < elements.length; i++) {
            if (links.length >= 50) break; // Limit payload size
            const el = elements[i];

            if (!this.isVisible(el)) continue;

            const text = this.cleanText(el.textContent) || el.getAttribute('aria-label') || '';
            if (!text) continue;

            // Only grab internal links to keep context relevant to the current app flow
            let href = el.href;
            if (href.startsWith(origin)) {
                href = href.replace(origin, '');
            } else if (href.startsWith('http')) {
                // Skip external links for snapshot density
                continue;
            }

            links.push({
                text,
                href
            });
        }
        return links;
    }

    private extractFormFields(): SnapshotFormField[] {
        const fields: SnapshotFormField[] = [];
        const elements = document.querySelectorAll<HTMLElement>('input:not([type="hidden"]), select, textarea');

        for (let i = 0; i < elements.length; i++) {
            if (fields.length >= 30) break;
            const el = elements[i];
            if (!this.isVisible(el)) continue;

            let label = '';

            // 1. Try aria-labelledby
            const labelledBy = el.getAttribute('aria-labelledby');
            if (labelledBy) {
                const labelEl = document.getElementById(labelledBy);
                if (labelEl) label = this.cleanText(labelEl.textContent);
            }

            // 2. Try explicit <label for="id">
            if (!label && el.id) {
                const labelEl = document.querySelector<HTMLLabelElement>(`label[for="${el.id}"]`);
                if (labelEl) label = this.cleanText(labelEl.textContent);
            }

            // 3. Try implicit <label> wrapper
            if (!label) {
                const parentLabel = el.closest('label');
                if (parentLabel) {
                    // Remove the input's own text if any before getting label text
                    const clone = parentLabel.cloneNode(true) as HTMLElement;
                    const inputClone = clone.querySelector('input, select, textarea');
                    if (inputClone) inputClone.remove();
                    label = this.cleanText(clone.textContent);
                }
            }

            // 4. Fallback to placeholder or aria-label
            if (!label) {
                label = el.getAttribute('placeholder') || el.getAttribute('aria-label') || '';
            }

            const name = 'name' in el && typeof el.name === 'string' ? el.name : undefined;
            const type = el.tagName.toLowerCase() === 'input' ? (el as HTMLInputElement).type || 'text' : el.tagName.toLowerCase();

            fields.push({
                label,
                type,
                ...(name ? { name } : {})
            });
        }

        return fields;
    }

    private extractBreadcrumbs(): string[] {
        const breadcrumbTexts: string[] = [];

        // Look for common breadcrumb patterns
        const containers = document.querySelectorAll(
            'nav[aria-label*="breadcrumb" i], .breadcrumb, [class*="breadcrumb" i]'
        );

        if (containers.length > 0) {
            const container = containers[0]; // Assume first is main
            const links = container.querySelectorAll('a, span'); // Also grab current non-link item

            links.forEach(link => {
                const text = this.cleanText(link.textContent);
                if (text && text !== '/' && text !== '>') {
                    breadcrumbTexts.push(text);
                }
            });
        }

        return breadcrumbTexts;
    }
}
