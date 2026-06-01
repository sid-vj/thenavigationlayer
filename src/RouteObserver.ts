
export interface RouteChangeMeta {
    path: string;
    title: string;
    referrer: string;
    previousPath: string;
}

export class RouteObserver {
    private lastPath: string = '';

    constructor(private onRouteChanged: (url: string, meta: RouteChangeMeta) => void) { }

    public enable() {
        this.lastPath = window.location.pathname;
        this.patchHistory();
        this.listenPopState();
    }

    private patchHistory() {
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = (...args) => {
            originalPushState.apply(history, args);
            this.handleRouteChange();
        };

        history.replaceState = (...args) => {
            originalReplaceState.apply(history, args);
            this.handleRouteChange();
        };
    }

    private listenPopState() {
        window.addEventListener('popstate', () => {
            this.handleRouteChange();
        });
    }

    private handleRouteChange() {
        const currentPath = window.location.pathname;
        if (this.lastPath !== currentPath) {
            const previousPath = this.lastPath;
            this.lastPath = currentPath;
            this.onRouteChanged(currentPath, {
                path: currentPath,
                title: document.title,
                referrer: document.referrer,
                previousPath,
            });
        }
    }
}
