import { h, Component } from 'preact';
import { ChatRuntime } from '../types';
import { CommandPalette } from './CommandPalette';
import { Logger } from '../utils/logger';

interface ChatWidgetProps {
    runtime: ChatRuntime;
}

interface AgentConfig {
    enabled: boolean;
    name: string;
    primaryColor: string;
    welcomeMessage: string;
}

interface ChatWidgetState {
    open: boolean;
    config: AgentConfig | null;
    loading: boolean;
}

export class ChatWidget extends Component<ChatWidgetProps, ChatWidgetState> {
    constructor(props: ChatWidgetProps) {
        super(props);
        this.state = {
            open: false,
            config: null,
            loading: true
        };
    }

    async componentDidMount() {
        try {
            // Fetch Config using the runtime's auth mechanism
            // Use the public accessor
            const publicKey = this.props.runtime.auth.getPublicKey();

            Logger.log('[ChatWidget] Fetching config for key:', publicKey);

            if (!publicKey) {
                Logger.warn('[ChatWidget] No public key found, skipping config fetch');
                this.setState({ loading: false });
                return;
            }

            // Fetch Config using the runtime's client
            const res = await this.props.runtime.client.get(`/agent/config?publicKey=${publicKey}`);

            // The IntentClient automatically throws on non-2xx responses and unboxes JSON
            const config = res;

            this.setState({ config, loading: false });
        } catch (e) {
            Logger.error('Failed to load agent config', e);
            this.setState({ loading: false });
        }

        // Listen for open/close events
        window.addEventListener('keydown', this.handleKeydown);
    }

    componentWillUnmount() {
        window.removeEventListener('keydown', this.handleKeydown);
    }

    handleKeydown = (e: KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
            e.preventDefault();
            this.setState(prev => ({ open: !prev.open }));
        }
        if (e.key === 'Escape' && this.state.open) {
            this.setState({ open: false });
        }
    };

    toggle = () => {
        this.setState(prev => ({ open: !prev.open }));
    };

    render() {
        const { open, config, loading } = this.state;
        const { runtime } = this.props;

        if (loading) return null;
        if (!config || !config.enabled) {
            // Fallback to hidden CommandPalette if widget disabled? 
            // Or just render CommandPalette hidden logic.
            // For now, let's assume if disabled, we still support Cmd+K potentially? 
            // Let's render CommandPalette logic but without FAB.
            return <CommandPalette runtime={runtime} />;
        }

        const primaryColor = config.primaryColor || '#000000';

        return (
            <div
                className="thias-widget-root"
                style={{
                    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"',
                    WebkitFontSmoothing: 'antialiased',
                    MozOsxFontSmoothing: 'grayscale'
                }}
            >
                {/* FAB Launcher */}
                <button
                    onClick={this.toggle}
                    style={{
                        position: 'fixed',
                        bottom: '20px',
                        right: '20px',
                        width: '60px',
                        height: '60px',
                        borderRadius: '30px',
                        backgroundColor: primaryColor,
                        color: 'white',
                        border: 'none',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        zIndex: 2147483646,
                        transition: 'transform 0.2s'
                    }}
                >
                    {open ? (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    ) : (
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    )}
                </button>

                {/* Chat Window */}
                {open && (
                    <div
                        style={{
                            position: 'fixed',
                            bottom: '100px',
                            right: '20px',
                            width: '380px',
                            height: '650px',
                            maxHeight: '85vh',
                            backgroundColor: '#ffffff',
                            borderRadius: '24px',
                            boxShadow: '0 12px 48px rgba(0,0,0,0.12), 0 4px 16px rgba(0,0,0,0.08)',
                            display: 'flex',
                            flexDirection: 'column',
                            overflow: 'hidden',
                            zIndex: 2147483647,
                            border: '1px solid #e5e7eb'
                        }}
                    >
                        {/* Header */}
                        <div style={{
                            padding: '24px 20px',
                            background: primaryColor,
                            color: 'white',
                            borderTopLeftRadius: '24px',
                            borderTopRightRadius: '24px',
                            boxShadow: '0 2px 10px rgba(0,0,0,0.05)',
                            position: 'relative',
                            overflow: 'hidden'
                        }}>
                            <h3 style={{ margin: 0, fontWeight: 700, fontSize: '18px', letterSpacing: '-0.02em', position: 'relative', zIndex: 1 }}>{config.name}</h3>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px', position: 'relative', zIndex: 1 }}>
                                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981', boxShadow: '0 0 8px rgba(16, 185, 129, 0.5)' }}></span>
                                <p style={{ margin: 0, fontSize: '13px', opacity: 0.9, fontWeight: 500 }}>Online</p>
                            </div>
                        </div>

                        {/* Content Area */}
                        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', backgroundColor: '#ffffff' }}>
                            {/* Welcome Message */}
                            <div style={{
                                alignSelf: 'flex-start',
                                backgroundColor: '#f8fafc',
                                border: '1px solid #e2e8f0',
                                padding: '14px 18px',
                                borderRadius: '18px 18px 18px 4px',
                                marginBottom: '20px',
                                maxWidth: '85%',
                                color: '#334155',
                                fontSize: '14.5px',
                                lineHeight: '1.5',
                                boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
                            }}>
                                {config.welcomeMessage}
                            </div>

                            {/* Command / Chat Components */}
                            <div style={{ display: 'flex', flexDirection: 'column', flex: 1, boxSizing: 'border-box' }}>
                                <CommandPalette runtime={runtime} embedded={true} themeColor={primaryColor} />
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }
}
