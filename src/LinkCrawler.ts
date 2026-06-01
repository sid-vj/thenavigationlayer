/**
 * LinkCrawler Module
 * 
 * Runs on page load to extract all internal <a> links from the DOM.
 * Sends them as a $crawl_links event for graph discovery.
 */

import { IEventEmitter } from './types';
import { Logger } from './utils/logger';

export class LinkCrawler {
    private crawledPages = new Set<string>();

    constructor(private eventEmitter: IEventEmitter) { }

    /**
     * Crawl the current page for internal links.
     * Only crawls each page once per session.
     */
    public crawlCurrentPage() {
        const currentPath = window.location.pathname;

        // Skip if already crawled this page
        if (this.crawledPages.has(currentPath)) return;
        this.crawledPages.add(currentPath);

        // Delay slightly to ensure page is fully rendered
        setTimeout(() => {
            const links = this.extractLinks();
            if (links.length > 0) {
                Logger.log(`[LinkCrawler] Found ${links.length} internal links on ${currentPath}`);
                this.eventEmitter.track('$crawl_links', {
                    page: currentPath,
                    links,
                });
            }
        }, 1500); // Wait for SPA content to render
    }

    /**
     * Extract all unique internal <a> links from the page.
     */
    private extractLinks(): { href: string; text: string }[] {
        const seen = new Set<string>();
        const links: { href: string; text: string }[] = [];

        document.querySelectorAll('a[href]').forEach((el) => {
            const anchor = el as HTMLAnchorElement;

            try {
                const url = new URL(anchor.href, window.location.origin);

                // Only internal links (same origin)
                if (url.origin !== window.location.origin) return;

                // Ignore anchors, API routes, assets
                const path = url.pathname;
                if (path.startsWith('/api/') ||
                    path.startsWith('/_next/') ||
                    path.includes('.') ||      // file extensions
                    seen.has(path)) return;

                seen.add(path);
                links.push({
                    href: path,
                    text: (anchor.textContent || '').trim().slice(0, 100),
                });
            } catch {
                // Invalid URL, skip
            }
        });

        return links;
    }
}
