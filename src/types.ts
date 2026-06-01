export interface IEventEmitter {
    track(event: string, properties?: Record<string, any>): void;
}

export interface IIntentClient {
    get(endpoint: string): Promise<any>;
    post(endpoint: string, body: any): Promise<any>;
    getSessionId?(): string;
    getPublicKey?(): string | null;
}

export interface ChatRuntime {
    auth: { getPublicKey(): string | null };
    client: IIntentClient;
    fetchIntent(query: string, conversationHistory?: { role: string; content: string }[]): Promise<any>;
    executePlan(steps: any[], query: string): Promise<void>;
    track(event: string, properties?: Record<string, any>): void;
    onAgenticLoop: ((query: string) => void) | null;
}
