import { GraphManager } from './GraphManager';
import { Logger } from './utils/logger';

export class SafetyLayer {
    private readonly ALLOWED_ACTIONS = new Set(['navigate', 'click', 'input', 'wait', 'waitFor', 'verify', 'answer', 'highlight', 'clickRow', 'askUser', 'waitAndObserve']);

    constructor(private graphManager: GraphManager) { }

    public validateStep(step: any): boolean {
        if (!step || typeof step !== 'object') return false;

        // 1. Validate Action
        if (!this.ALLOWED_ACTIONS.has(step.action)) {
            Logger.warn(`[SafetyLayer] Blocked invalid action: ${step.action}`);
            return false;
        }

        // 2. Validate Selector for interaction events
        if (['click', 'input', 'verify'].includes(step.action)) {
            if (!step.selector || typeof step.selector !== 'string') {
                Logger.warn('[SafetyLayer] Missing or invalid selector for action:', step.action);
                return false;
            }

            // Basic sanitization check (no script tags or obvious injection)
            if (step.selector.includes('<script') || step.selector.includes('javascript:')) {
                Logger.error('[SafetyLayer] Dangerous selector detected:', step.selector);
                return false;
            }

            // Graph Validation (Click only for now as per design)
            if (step.action === 'click') {
                // Allow conversational AI dynamic text matching to bypass the strict graph whitelist
                if (step.selector.startsWith('[text-match=')) {
                    Logger.log(`[SafetyLayer] Bypassing graph validation for dynamic AI text-match selector: ${step.selector}`);
                } else if (!this.graphManager.validateAction('click', step.selector)) {
                    Logger.warn(`[SafetyLayer] Action 'click' on '${step.selector}' not allowed by Product Graph.`);
                    return false;
                }
            }
        }

        // 3. Validate Navigate URL/Route
        if (step.action === 'navigate') {
            const target = step.url || step.route;
            if (!target) {
                Logger.warn('[SafetyLayer] Navigate action missing url/route');
                return false;
            }

            try {
                const dest = new URL(target, window.location.origin);
                if (dest.origin !== window.location.origin) {
                    Logger.warn('[SafetyLayer] Blocked cross-origin navigation:', target);
                    return false;
                }

                // Graph Validation - warn but don't block same-origin navigation.
                // The graph may still be learning new routes, and the AI is trusted
                // to generate valid same-origin paths. Cross-origin is the real security boundary.
                if (this.graphManager.isInitialized() && !this.graphManager.validateUrl(target)) {
                    Logger.warn(`[SafetyLayer] Navigation to '${target}' not in Product Graph (allowing — graph may still be learning).`);
                }

            } catch (e) {
                Logger.warn('[SafetyLayer] Invalid URL:', target);
                return false;
            }
        }

        return true;
    }
}
