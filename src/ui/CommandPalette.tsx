import { h, Fragment } from 'preact';
import { signal } from '@preact/signals';
import { useEffect } from 'preact/hooks';
import { ChatRuntime } from '../types';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { Logger } from '../utils/logger';

const isOpen = signal(false);
const query = signal('');
const status = signal<'IDLE' | 'THINKING' | 'EXECUTING' | 'FAILED' | 'CORRECTED'>('IDLE');
const errorMsg = signal('');
const correction = signal('');
const messages = signal<{
    role: 'user' | 'assistant' | 'thinking' | 'options',
    content: string,
    options?: { label: string; value: string }[]
}[]>([]);
const thinkingStep = signal(0);
const conversationHistory = signal<{ role: string; content: string }[]>([]);

// ─── Session Persistence ───
// Survives page navigations (SPA route changes & full reloads)
const SESSION_KEY = 'thias_chat_session';

function saveSession() {
    try {
        const data = {
            messages: messages.value.filter(m => m.role !== 'thinking'),
            history: conversationHistory.value,
            isOpen: isOpen.value,
            ts: Date.now(),
        };
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch (e) { /* sessionStorage may be unavailable */ }
}

function restoreSession() {
    try {
        const raw = sessionStorage.getItem(SESSION_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        // Only restore if session is less than 30 minutes old
        if (Date.now() - data.ts > 30 * 60 * 1000) {
            sessionStorage.removeItem(SESSION_KEY);
            return;
        }
        if (data.messages?.length > 0) {
            messages.value = data.messages;
        }
        if (data.history?.length > 0) {
            conversationHistory.value = data.history;
        }
        if (data.isOpen) {
            isOpen.value = true;
        }
    } catch (e) { /* ignore parse errors */ }
}

const THINKING_STEPS = [
    '🔍 Reading your screen...',
    '🧠 Analyzing page context...',
    '⚡ Generating response...'
];

let thinkingInterval: any = null;

function startThinking() {
    thinkingStep.value = 0;
    messages.value = [...messages.value, { role: 'thinking', content: THINKING_STEPS[0] }];

    thinkingInterval = setInterval(() => {
        thinkingStep.value = Math.min(thinkingStep.value + 1, THINKING_STEPS.length - 1);
        const msgs = [...messages.value];
        const lastIdx = msgs.findLastIndex(m => m.role === 'thinking');
        if (lastIdx >= 0) {
            msgs[lastIdx] = { role: 'thinking', content: THINKING_STEPS[thinkingStep.value] };
            messages.value = msgs;
        }
    }, 1200); // Slightly faster animation
}

function stopThinking() {
    if (thinkingInterval) {
        clearInterval(thinkingInterval);
        thinkingInterval = null;
    }
    messages.value = messages.value.filter(m => m.role !== 'thinking');
}

interface Props {
    runtime: ChatRuntime;
    embedded?: boolean;
    themeColor?: string;
}

export function CommandPalette({ runtime, embedded = false, themeColor = '#0f172a' }: Props) {

    // Restore session on mount
    useEffect(() => {
        restoreSession();

        if (embedded) {
            isOpen.value = true;
            return;
        }

        const handleKeydown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
                isOpen.value = !isOpen.value;
                if (isOpen.value) {
                    status.value = 'IDLE';
                    errorMsg.value = '';
                }
                saveSession();
            }
            if (e.key === 'Escape') {
                isOpen.value = false;
                saveSession();
            }
        };

        window.addEventListener('keydown', handleKeydown);

        // Save session before page unload (navigation)
        const handleBeforeUnload = () => saveSession();
        window.addEventListener('beforeunload', handleBeforeUnload);

        // Bind agentic loop callback
        runtime.onAgenticLoop = (loopQuery: string) => {
            Logger.log("[Thias SDK] Cross-page waitAndObserve triggered. Initiating agentic loop...");
            if (!isOpen.value) isOpen.value = true;
            status.value = 'THINKING';
            sendQuery(loopQuery, true).catch(() => {
                status.value = 'FAILED';
                errorMsg.value = 'Failed to resume cross-page task.';
            });
        };

        return () => {
            window.removeEventListener('keydown', handleKeydown);
            window.removeEventListener('beforeunload', handleBeforeUnload);
            runtime.onAgenticLoop = null;
        };
    }, [embedded, runtime]);

    const sendQuery = async (userMessage: string, isSilentLoop = false, loopDepth = 0) => {
        if (!isSilentLoop) {
            messages.value = [...messages.value, { role: 'user', content: userMessage }];
            conversationHistory.value = [...conversationHistory.value, { role: 'user', content: userMessage }];
            saveSession();
        }

        status.value = 'THINKING';
        errorMsg.value = '';
        startThinking();

        try {
            const response = await runtime.fetchIntent(userMessage, conversationHistory.value);
            
            let answerText = "";
            let askUserStep: any = null;
            let waitStep: any = null;

            if (response && response.plan && response.plan.length > 0) {
                askUserStep = response.plan.find((s: any) => s.action === 'askUser');
                const answerStep = response.plan.find((s: any) => s.action === 'answer');
                waitStep = response.plan.find((s: any) => s.action === 'waitAndObserve');

                if (answerStep) {
                    answerText = answerStep.text;
                } else if (response.thought_process) {
                    answerText = response.thought_process;
                }
            } else if (response && response.thought_process) {
                answerText = response.thought_process;
            } else {
                answerText = "I couldn't understand that request against your current configuration.";
            }

            // Immediately display text to user and SAVE session
            // so we don't lose the message if the next phase triggers a hard navigation
            if (answerText) {
                messages.value = [...messages.value, { role: 'assistant', content: answerText }];
                conversationHistory.value = [...conversationHistory.value, { role: 'assistant', content: answerText }];
                saveSession();
            }

            stopThinking();
            status.value = 'EXECUTING';

            // Now handle UI interactions
            if (askUserStep) {
                messages.value = [...messages.value, {
                    role: 'options',
                    content: askUserStep.text,
                    options: askUserStep.options
                }];
                conversationHistory.value = [...conversationHistory.value, {
                    role: 'assistant',
                    content: askUserStep.text
                }];
                status.value = 'IDLE';
                saveSession();
                return;
            }

            // Fire to executor (this might reload the page!)
            if (response?.plan && response.plan.length > 0) {
                await runtime.executePlan(response.plan, userMessage);
            }

            // If we are still here, NO hard navigation happened (or it hasn't killed the thread yet).
            if (waitStep) {
                if (loopDepth >= 3) {
                    Logger.warn("[Thias SDK] Max agentic loop depth reached. Aborting to prevent infinite loop.");
                    status.value = 'FAILED';
                    errorMsg.value = 'Agent got stuck. Please try a more specific request.';
                    return;
                }
                
                Logger.log("[Thias SDK] waitAndObserve triggered (intra-page). Initiating agentic loop...");
                status.value = 'THINKING';
                setTimeout(() => {
                    sendQuery(userMessage, true, loopDepth + 1).catch(err => {
                        status.value = 'FAILED';
                        errorMsg.value = 'Failed during multi-step continuation.';
                    });
                }, 2500);
                return; // exit current loop early
            }

            // DON'T close the panel after navigation — keep context alive
            // The user can continue asking follow-up questions
            status.value = 'IDLE';
            saveSession();
        } catch (err: any) {
            stopThinking();
            Logger.error(err);
            status.value = 'FAILED';
            errorMsg.value = err.message || "Failed to execute intent.";
        }
    };

    const handleSubmit = async (e: Event) => {
        e.preventDefault();
        if (!query.value.trim()) return;
        const currentQuery = query.value;
        query.value = '';
        await sendQuery(currentQuery);
    };

    const handleOptionClick = async (option: { label: string; value: string }) => {
        await sendQuery(option.value);
    };

    const handleClearSession = () => {
        messages.value = [];
        conversationHistory.value = [];
        sessionStorage.removeItem(SESSION_KEY);
        status.value = 'IDLE';
    };

    const handleCorrection = async (e: Event) => {
        e.preventDefault();
        if (!correction.value.trim()) return;

        status.value = 'THINKING';

        try {
            const publicKey = runtime.auth.getPublicKey();
            const res = await runtime.client.post('/agent/correction', {
                originalQuery: query.value,
                correctedEntityName: correction.value
            });
            status.value = 'CORRECTED';

            setTimeout(() => {
                status.value = 'IDLE';
                query.value = '';
                correction.value = '';
            }, 2000);

        } catch (err: any) {
            status.value = 'FAILED';
            errorMsg.value = "Failed to submit correction.";
        }
    }

    if (!isOpen.value) return null;

    const content = (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', boxSizing: 'border-box' }}>
            {/* Messages Area */}
            <div style={{ flex: embedded ? 1 : 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                {messages.value.map((msg, idx) => {
                    if (msg.role === 'options') {
                        return (
                            <div key={idx} style={{ alignSelf: 'flex-start', maxWidth: '90%' }}>
                                <div style={{
                                    backgroundColor: '#f8fafc',
                                    border: '1px solid #e2e8f0',
                                    padding: '12px 16px',
                                    borderRadius: '16px 16px 16px 4px',
                                    fontSize: '14px',
                                    lineHeight: '1.5',
                                    color: '#334155',
                                    marginBottom: '10px',
                                    boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                                }}>
                                    {msg.content}
                                </div>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingLeft: '4px' }}>
                                    {msg.options?.map((opt, oidx) => (
                                        <button
                                            key={oidx}
                                            onClick={() => handleOptionClick(opt)}
                                            disabled={status.value !== 'IDLE'}
                                            style={{
                                                padding: '8px 14px',
                                                borderRadius: '24px',
                                                border: '1px solid #e0e7ff',
                                                background: '#fefeff',
                                                color: '#4f46e5',
                                                fontSize: '13px',
                                                fontWeight: 500,
                                                cursor: status.value === 'IDLE' ? 'pointer' : 'not-allowed',
                                                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                                                opacity: status.value === 'IDLE' ? 1 : 0.6,
                                                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
                                            }}
                                            onMouseEnter={(e) => {
                                                if (status.value === 'IDLE') {
                                                    (e.currentTarget as HTMLButtonElement).style.background = themeColor;
                                                    (e.currentTarget as HTMLButtonElement).style.color = 'white';
                                                    (e.currentTarget as HTMLButtonElement).style.borderColor = themeColor;
                                                    (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
                                                    (e.currentTarget as HTMLButtonElement).style.boxShadow = `0 4px 6px ${themeColor}26`; // 15% opacity
                                                }
                                            }}
                                            onMouseLeave={(e) => {
                                                (e.currentTarget as HTMLButtonElement).style.background = '#fefeff';
                                                (e.currentTarget as HTMLButtonElement).style.color = '#4f46e5';
                                                (e.currentTarget as HTMLButtonElement).style.borderColor = '#e0e7ff';
                                                (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(0)';
                                                (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)';
                                            }}
                                        >
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        );
                    }

                    if (msg.role === 'thinking') {
                        return (
                            <div key={idx} style={{
                                alignSelf: 'flex-start',
                                padding: '12px 16px',
                                fontSize: '13px',
                                color: '#64748b',
                                backgroundColor: '#f8fafc',
                                borderRadius: '16px 16px 16px 4px',
                                border: '1px solid #f1f5f9',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '10px',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}>
                                <span style={{ display: 'inline-flex', gap: '4px', alignItems: 'center' }}>
                                    <span style={{ animation: 'thiasPulse 1.4s infinite', animationDelay: '0s', width: '5px', height: '5px', borderRadius: '50%', background: themeColor, display: 'inline-block' }} />
                                    <span style={{ animation: 'thiasPulse 1.4s infinite', animationDelay: '0.2s', width: '5px', height: '5px', borderRadius: '50%', background: themeColor, display: 'inline-block' }} />
                                    <span style={{ animation: 'thiasPulse 1.4s infinite', animationDelay: '0.4s', width: '5px', height: '5px', borderRadius: '50%', background: themeColor, display: 'inline-block' }} />
                                </span>
                                <span style={{ fontWeight: 500 }}>{msg.content}</span>
                            </div>
                        );
                    }

                    return (
                        <div key={idx} style={{
                            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                            backgroundColor: msg.role === 'user' ? themeColor : '#f8fafc',
                            color: msg.role === 'user' ? '#ffffff' : '#334155',
                            border: msg.role === 'user' ? 'none' : '1px solid #e2e8f0',
                            padding: '12px 16px',
                            borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                            maxWidth: '85%',
                            fontSize: '14.5px',
                            lineHeight: '1.5',
                            boxShadow: msg.role === 'user' ? `0 4px 12px ${themeColor}26` : '0 2px 4px rgba(0,0,0,0.02)',
                            letterSpacing: '-0.01em'
                        }}>
                            {msg.role === 'assistant' ? (
                                <div
                                    className="thias-md-content"
                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(marked.parse(msg.content) as string) }}
                                />
                            ) : (
                                msg.content
                            )}
                        </div>
                    );
                })}

                {status.value === 'FAILED' && (
                    <div style={{ marginBottom: '16px', padding: '12px', background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '8px' }}>
                        <p style={{ margin: 0, fontSize: '14px', color: '#991B1B', fontWeight: 500 }}>
                            {errorMsg.value}
                        </p>
                        <form onSubmit={handleCorrection} style={{ marginTop: '12px' }}>
                            <label style={{ fontSize: '12px', color: '#7F1D1D', display: 'block', marginBottom: '4px' }}>
                                Did I misunderstand a term? What did you mean?
                            </label>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input
                                    type="text"
                                    placeholder="e.g. Settings, Profile..."
                                    value={correction.value}
                                    onInput={(e) => (correction.value = (e.currentTarget as HTMLInputElement).value)}
                                    style={{ flex: 1, padding: '6px 10px', fontSize: '13px', borderRadius: '4px', border: '1px solid #FCA5A5', outline: 'none' }}
                                />
                                <button type="submit" style={{ padding: '6px 12px', background: '#EF4444', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', fontWeight: 500 }}>
                                    Teach Agent
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {status.value === 'CORRECTED' && (
                    <div style={{ marginBottom: '12px', padding: '8px', color: '#059669', fontSize: '13px', fontWeight: 500, textAlign: 'center' }}>
                        Thanks! I'll remember this for next time.
                    </div>
                )}
            </div>

            <form onSubmit={handleSubmit} style={embedded ? { marginTop: 'auto', marginBottom: '8px', position: 'relative' } : {}}>
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                    <input
                        className={embedded ? "thias-chat-input" : "input"}
                        type="text"
                        placeholder="Message agent..."
                        value={query.value}
                        onInput={(e) => (query.value = (e.currentTarget as HTMLInputElement).value)}
                        onKeyDown={(e) => e.stopPropagation()}
                        disabled={status.value !== 'IDLE' && status.value !== 'FAILED'}
                        autoFocus
                        style={embedded ? {
                            width: '100%',
                            padding: '14px 44px 14px 16px',
                            borderRadius: '12px',
                            border: '1px solid #e2e8f0',
                            outline: 'none',
                            boxSizing: 'border-box',
                            color: '#0f172a',
                            fontSize: '14.5px',
                            backgroundColor: '#ffffff',
                            boxShadow: '0 2px 6px rgba(0,0,0,0.03)',
                            transition: 'all 0.2s ease'
                        } : {}}
                    />
                    {embedded && (
                        <button
                            type="submit"
                            disabled={!query.value.trim() || (status.value !== 'IDLE' && status.value !== 'FAILED')}
                            style={{
                                position: 'absolute',
                                right: '8px',
                                background: query.value.trim() ? themeColor : '#f1f5f9',
                                color: query.value.trim() ? 'white' : '#94a3b8',
                                border: 'none',
                                borderRadius: '8px',
                                width: '32px',
                                height: '32px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                cursor: query.value.trim() ? 'pointer' : 'default',
                                transition: 'all 0.2s ease',
                                padding: 0
                            }}
                        >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="12" y1="19" x2="12" y2="5"></line>
                                <polyline points="5 12 12 5 19 12"></polyline>
                            </svg>
                        </button>
                    )}
                </div>
            </form>

            <div style={{ fontSize: '12px', color: '#A1A1AA', display: 'flex', gap: '8px', justifyContent: embedded ? 'center' : 'flex-start', alignItems: 'center' }}>
                {!embedded && <span>cmd+k to close</span>}
                {embedded && <span style={{ opacity: 0.6, fontWeight: 500, letterSpacing: '-0.01em' }}>Powered by thias-ai.com</span>}
                {status.value === 'EXECUTING' && <span style={{ color: '#10B981' }}>✓ Done</span>}
                {conversationHistory.value.length > 0 && (
                    <button
                        onClick={handleClearSession}
                        style={{
                            marginLeft: 'auto',
                            background: 'none',
                            border: 'none',
                            color: '#A1A1AA',
                            fontSize: '11px',
                            cursor: 'pointer',
                            padding: '2px 6px',
                            borderRadius: '4px',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#EF4444'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#A1A1AA'; }}
                    >
                        Clear chat
                    </button>
                )}
            </div>

            <style dangerouslySetInnerHTML={{
                __html: `
                @keyframes thiasPulse {
                    0%, 80%, 100% { opacity: 0.4; transform: scale(0.8); }
                    40% { opacity: 1; transform: scale(1.1); }
                }
                .thias-chat-input:focus {
                    border-color: #94a3b8 !important;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.06) !important;
                }
            `}} />
        </div >
    );

    if (embedded) {
        return content;
    }

    return (
        <div className="overlay" onClick={() => { isOpen.value = false; saveSession(); }}>
            <div className="panel" onClick={(e) => e.stopPropagation()}>
                {content}
            </div>
        </div>
    );
}
