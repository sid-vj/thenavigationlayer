
/**
 * Simple Logger utility that can be silenced.
 * Default: ONLY errors are printed in the console.
 */
export class Logger {
    private static isDebug = false;

    public static setDebug(enabled: boolean) {
        this.isDebug = enabled;
    }

    public static log(...args: any[]) {
        if (this.isDebug) {
            console.log(...args);
        }
    }

    public static warn(...args: any[]) {
        if (this.isDebug) {
            console.warn(...args);
        }
    }

    public static info(...args: any[]) {
        if (this.isDebug) {
            console.info(...args);
        }
    }

    public static error(...args: any[]) {
        // Errors are always printed as per user request
        console.error(...args);
    }
}
