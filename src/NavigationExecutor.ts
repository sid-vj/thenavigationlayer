import { SafetyLayer } from "./SafetyLayer";
import { IEventEmitter } from "./types";
import { Logger } from "./utils/logger";

export type ActionType = 'navigate' | 'click' | 'input' | 'wait' | 'waitFor' | 'verify' | 'answer' | 'highlight' | 'clickRow' | 'askUser' | 'waitAndObserve';

export interface ExecutionStep {
    id: string;
    action: ActionType;
    required_route?: string;
    url?: string;
    route?: string;
    selector?: string;
    value?: string;
    text?: string;
    message?: string;
    unique?: boolean;
    description?: string;
    timeout_ms?: number;
    options?: { label: string; value: string }[];
}

export class NavigationExecutor {
    constructor(
        private safetyFn: SafetyLayer,
        private events: IEventEmitter
    ) { }

    public async executePlan(steps: ExecutionStep[], originalQuery: string = "") {
        Logger.log('[Executor] Starting plan with', steps.length, 'steps');

        for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            Logger.log(`[Executor] Processing step ${step.id}: ${step.description || step.action}`);

            // If navigating and not the last step, persist remaining steps to seamlessly resume on the next page
            if (step.action === 'navigate' && i < steps.length - 1) {
                const remainingSteps = steps.slice(i + 1);
                Logger.log(`[Thias] Suspending execution for navigation. Saving ${remainingSteps.length} steps.`);
                sessionStorage.setItem('thias_pending_plan', JSON.stringify({ steps: remainingSteps, query: originalQuery }));
            }

            let hardNavigated: boolean | void = false;

            try {
                // 1. Safety Check
                if (!this.safetyFn.validateStep(step)) {
                    throw new Error(`Safety violation for step '${step.description || step.action}'`);
                }

                // 2. Pre-Action Verification
                await this.verifyContext(step);

                // 3. Execution
                hardNavigated = await this.executeStep(step);

                // 4. Emit Success
                this.events.track('step_completed', { step_id: step.id, action: step.action });

                // If we didn't actually navigate, clear the pending plan we proactively saved
                if (step.action === 'navigate' && !hardNavigated) {
                    sessionStorage.removeItem('thias_pending_plan');
                }

            } catch (err: any) {
                Logger.error(`[Executor] Step ${step.id} failed:`, err);
                this.events.track('step_failed', { step_id: step.id, error: err.message });
                sessionStorage.removeItem('thias_pending_plan');
                throw err; // Stop execution of the plan
            }

            // Immediately halt processing loop on a successful hard navigation
            if (step.action === 'navigate' && hardNavigated) {
                return;
            }
        }

        Logger.log('[Executor] Plan passed successfully');
    }

    private async verifyContext(step: ExecutionStep) {
        // A. Route Check
        if (step.required_route) {
            if (!window.location.pathname.startsWith(step.required_route)) {
                throw new Error(`Route mismatch. Required: ${step.required_route}, Current: ${window.location.pathname}`);
            }
        }

        // B. Element Presence (for interaction steps)
        if (['click', 'input', 'verify'].includes(step.action) && step.selector) {
            const el = await this.waitForElement(step.selector, step.timeout_ms || 2000);
            if (!el) {
                throw new Error(`Element not found: ${step.selector}`);
            }
            // Visibility check could be added here
        }
    }

    private async executeStep(step: ExecutionStep): Promise<boolean | void> {
        switch (step.action) {
            case 'wait':
                await new Promise(r => setTimeout(r, step.timeout_ms || 1000));
                break;

            case 'click':
                let clickTarget = this.findElement(step.selector || '') as HTMLElement | null;

                if (clickTarget) {
                    // Ascend to the closest interactive element if we hit an inner span/icon
                    const interactiveParent = clickTarget.closest('button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="tab"], .btn, li') as HTMLElement;
                    if (interactiveParent) {
                        clickTarget = interactiveParent;
                    }

                    Logger.log('[Executor] Clicking element:', clickTarget);
                    
                    // Dispatch modern synthetic events for frameworks like React 18+
                    clickTarget.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
                    clickTarget.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                    clickTarget.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
                    clickTarget.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                    clickTarget.click();
                } else {
                    throw new Error(`Click target not found for selector: ${step.selector}`);
                }
                break;

            case 'input':
                const input = this.findElement(step.selector || '') as HTMLInputElement;
                if (input) {
                    Logger.log(`[Executor] Writing to input: ${step.selector} value: ${step.value}`);
                    // React active value tracker workaround often needs simple property set
                    const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value");
                    if (descriptor && descriptor.set) {
                        descriptor.set.call(input, step.value || '');
                    } else {
                        input.value = step.value || '';
                    }
                    input.dispatchEvent(new Event('input', { bubbles: true }));
                    input.dispatchEvent(new Event('change', { bubbles: true }));
                        
                    // Fire Enter keypress to trigger form submissions/filters natively in React
                    input.dispatchEvent(new KeyboardEvent('keydown', { 'key': 'Enter', 'bubbles': true }));
                    input.dispatchEvent(new KeyboardEvent('keyup',   { 'key': 'Enter', 'bubbles': true }));
                    input.dispatchEvent(new KeyboardEvent('keypress',{ 'key': 'Enter', 'bubbles': true }));

                } else {
                    throw new Error(`Input field not found for selector: ${step.selector}`);
                }
                break;

            case 'navigate':
                const navTarget = step.url || step.route;
                if (navTarget) {
                    Logger.log('[Executor] Navigating to:', navTarget);
                    // Prevent redundant reloads if already on the exact path and query
                    const currentPath = window.location.pathname + window.location.search;
                    const targetUrlInfo = navTarget.startsWith('http') ? new URL(navTarget) : new URL(navTarget, window.location.origin);
                    const targetPath = targetUrlInfo.pathname + targetUrlInfo.search;
                    
                    if (currentPath === targetPath || (targetPath === '/' && currentPath === '')) {
                         Logger.log('[Executor] Already on path and query, skipping hard navigation.');
                         return false;
                    }
                    // Use full page navigation for Next.js / SPA frameworks
                    window.location.href = navTarget;
                    return true;
                }
                break;

            case 'verify':
                // Verification already happened in verifyContext
                Logger.log('[Executor] Verified presence of', step.selector);
                break;

            case 'answer':
                Logger.log('[Executor] Passing AI Answer to UI:', step.text);
                break;

            case 'highlight':
                if (step.selector) {
                    const highlightEl = this.findElement(step.selector) as HTMLElement;
                    if (highlightEl) {
                        Logger.log('[Executor] Highlighting element:', step.selector);
                        const origOutline = highlightEl.style.outline;
                        const origTransition = highlightEl.style.transition;
                        highlightEl.style.transition = 'outline 0.3s ease-in-out';
                        highlightEl.style.outline = '3px solid #6366f1';
                        highlightEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        // Pulse 3 times then restore
                        let pulseCount = 0;
                        const pulseInterval = setInterval(() => {
                            pulseCount++;
                            highlightEl.style.outline = pulseCount % 2 === 0 ? '3px solid #6366f1' : '3px solid transparent';
                            if (pulseCount >= 6) {
                                clearInterval(pulseInterval);
                                highlightEl.style.outline = origOutline;
                                highlightEl.style.transition = origTransition;
                            }
                        }, 400);
                        if (step.message) {
                            Logger.log('[Executor] Highlight message:', step.message);
                        }
                    } else {
                        Logger.warn('[Executor] Highlight target not found:', step.selector);
                    }
                }
                break;

            case 'waitFor':
                if (step.selector) {
                    Logger.log('[Executor] Waiting for element:', step.selector);
                    const found = await this.waitForElement(step.selector, step.timeout_ms || 5000);
                    if (!found) {
                        throw new Error(`waitFor timed out: element '${step.selector}' not found`);
                    }
                    Logger.log('[Executor] Element found:', step.selector);
                }
                break;

            case 'clickRow':
                if (step.text) {
                    Logger.log('[Executor] Searching for row containing:', step.text);
                    const rows = document.querySelectorAll('tr, li, [role="row"]');
                    let clickedRow = false;
                    for (let i = 0; i < rows.length; i++) {
                        const row = rows[i] as HTMLElement;
                        if (row.textContent?.includes(step.text) && row.offsetWidth > 0) {
                            Logger.log('[Executor] Clicking row:', row);
                            row.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'mouse' }));
                            row.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                            row.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'mouse' }));
                            row.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                            row.click();
                            clickedRow = true;
                            break;
                        }
                    }
                    if (!clickedRow) {
                        throw new Error(`clickRow: No row containing '${step.text}' found`);
                    }
                }
                break;

            case 'askUser':
                // AskUser is handled by the UI layer — we just log it here.
                // The CommandPalette reads the step's text + options and renders buttons.
                Logger.log('[Executor] AskUser:', step.text, step.options);
                break;
                
            case 'waitAndObserve':
                // Simply logs and introduces a slight delay, allowing the CommandPalette's 
                // recursive executeCommand block to take over and fire the next snapshot iteration.
                Logger.log('[Thias SDK] Waiting and Observing for AI action loop...');
                await new Promise(resolve => setTimeout(resolve, 800));
                break;
        }
    }

    private findElement(selector: string): Element | null {
        if (!selector) return null;
        if (selector.includes('[text-match="')) {
            let textToMatch = selector.match(/\[text-match="(.*?)"\]/)?.[1]?.toLowerCase() || '';
            // Sanitize trailing dots that AI might append (e.g. "New record...")
            textToMatch = textToMatch.replace(/\.+$/, '').trim();
            
            if (textToMatch) {
                const interactables = Array.from(document.querySelectorAll('button, a, input, select, textarea, [role="button"], [role="menuitem"], [role="tab"], .btn, li, div, span, p'));
                
                let bestMatch: HTMLElement | null = null;
                let shortestTextLength = Infinity;

                for (let i = 0; i < interactables.length; i++) {
                    const el = interactables[i] as HTMLElement;
                    let text = (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || (el as HTMLInputElement).value || '').toLowerCase().trim();
                    
                    if (text && (text === textToMatch || text.includes(textToMatch))) {
                        // Keep the deepest/most specific node containing the text
                        if (text.length < shortestTextLength && text.length < textToMatch.length + 50 && el.offsetWidth > 0) {
                            shortestTextLength = text.length;
                            bestMatch = el;
                        }
                    }
                }
                
                if (bestMatch) {
                    return bestMatch;
                }
            }
            return null;
        }
        
        if (selector.includes('[label-match="')) {
            const labelText = selector.match(/\[label-match="(.*?)"\]/)?.[1]?.toLowerCase().replace(/\.+$/, '').trim() || '';
            if (labelText) {
                // 1. Try generic standard input attributes first
                try {
                    const fallback = document.querySelector(`input[aria-label*="${labelText}" i], input[placeholder*="${labelText}" i], input[name*="${labelText.replace(/\s/g, '-')}"]`);
                    if (fallback) return fallback;
                } catch(e) {}

                // 2. Try looking for text elements acting as labels
                const labels = Array.from(document.querySelectorAll('label, div, span, p, th, td'));
                for (let i = 0; i < labels.length; i++) {
                    const el = labels[i] as HTMLElement;
                    const text = (el.innerText || el.textContent || '').toLowerCase().trim();
                    if (text === labelText || text.includes(labelText)) {
                        // Native label for tracking
                        if (el.tagName === 'LABEL' && el.getAttribute('for')) {
                            const target = document.getElementById(el.getAttribute('for')!);
                            if (target) return target;
                        }
                        // Peer grouping (closest container)
                        const container = el.closest('div, tr, li, td, th');
                        if (container) {
                            const childInput = container.querySelector('input, textarea, select');
                            if (childInput) return childInput;
                        }
                    }
                }
            }
            return null;
        }

        try {
            return document.querySelector(selector);
        } catch (e) {
            return null;
        }
    }

    private waitForElement(selector: string, timeout: number): Promise<Element | null> {
        return new Promise((resolve) => {
            if (this.findElement(selector)) {
                return resolve(this.findElement(selector));
            }

            const observer = new MutationObserver(() => {
                const el = this.findElement(selector);
                if (el) {
                    observer.disconnect();
                    resolve(el);
                }
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(this.findElement(selector)); // Final check
            }, timeout);
        });
    }
}
