import { IIntentClient } from "./types";
import { Logger } from "./utils/logger";
import { patternToRegex } from "./utils/url-normalizer";

interface ProductGraphNode {
    id: string;
    urlPattern: string;
    name: string;
    type: string;
}

interface NavigationEdge {
    sourceNodeId: string;
    targetNodeId: string;
    action: 'click' | 'hover';
    selector: string;
}

interface ProductGraph {
    nodes: ProductGraphNode[];
    edges: NavigationEdge[];
}

export class GraphManager {
    private graph: ProductGraph | null = null;
    private initialized = false;

    constructor(private client: IIntentClient) { }

    public async initialize(prefetchedGraph?: ProductGraph) {
        if (this.initialized) return;

        if (prefetchedGraph) {
            this.graph = prefetchedGraph;
            this.initialized = true;
            Logger.log(`[GraphManager] Graph initialized from pre-fetched data: ${this.graph.nodes.length} nodes.`);
            return;
        }

        try {
            Logger.log('[GraphManager] Fetching Product Graph...');
            // The /agent/config endpoint expects publicKey as a query param
            const publicKey = this.client.getPublicKey ? this.client.getPublicKey() : '';
            const res = await this.client.get(`/agent/config?publicKey=${publicKey}`);

            if (res && res.graph) {
                this.graph = res.graph;
                this.initialized = true;
                Logger.log(`[GraphManager] Graph loaded: ${this.graph?.nodes.length} nodes, ${this.graph?.edges.length} edges.`);
            } else {
                Logger.warn('[GraphManager] Received empty or invalid graph config.');
            }
        } catch (error) {
            Logger.error('[GraphManager] Failed to fetch graph:', error);
        }
    }

    public isInitialized(): boolean {
        return this.initialized;
    }

    public validateUrl(url: string): boolean {
        if (!this.graph) return true; // Fail-safe (or strict deny? Requirement says "Safe Mode disables navigation", so deny?)
        // Let's implement Strict Deny if graph exists, but Allow if graph failed to load (Soft Fail)?
        // Re-reading requirements: "Fail-safe behavior if graph invalid -> Safe Mode: Disable Intent-based navigation"
        // This implies if graph is MISSING, we should probably BLOCK navigation actions.
        if (!this.initialized) return false;

        try {
            const path = new URL(url, window.location.origin).pathname;
            // Simple regex matching suitable for the browser
            return this.graph.nodes.some(node => {
                const regex = patternToRegex(node.urlPattern);
                return regex.test(path);
            });
        } catch (e) {
            Logger.warn('[GraphManager] URL validation error:', e);
            return false;
        }
    }

    public validateAction(action: string, selector?: string): boolean {
        if (!this.graph || !this.initialized) return false; // Safe Mode: Block
        if (action !== 'click') return true; // Only validating clicks for now (edges)
        if (!selector) return false;

        // Find current node based on URL
        const path = window.location.pathname;
        const currentNode = this.graph.nodes.find(node => patternToRegex(node.urlPattern).test(path));

        if (!currentNode) {
            Logger.warn(`[GraphManager] Current URL '${path}' not in graph. Action blocked.`);
            return false;
        }

        // Check if there is an edge from current node with this selector
        const allowed = this.graph.edges.some(edge =>
            edge.sourceNodeId === currentNode.id && edge.selector === selector
        );

        if (!allowed) {
            Logger.warn(`[GraphManager] Selector '${selector}' not valid for node '${currentNode.name}'.`);
        }

        return allowed;
    }
}
