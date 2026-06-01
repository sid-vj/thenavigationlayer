/**
 * Utility for normalizing URLs and matching patterns in the Product Graph.
 */

// Regular expressions for detecting dynamic segments
const UUID_REGEX = /[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}/;
const MONGO_ID_REGEX = /^[a-fA-F0-9]{24}$/;
const NUMERIC_ID_REGEX = /^\d+$/;
const SHORT_HEX_ID_REGEX = /^[A-Fa-f0-9]{8,}$/; // at least 8 hex chars (could overlap with words but usually safe for URL segments like /projects/a1b2c3d4)

/**
 * Checks if a path segment looks like a dynamic ID.
 */
function isDynamicSegment(segment: string): boolean {
    if (!segment) return false;
    
    // Ignore common static words that might look like IDs
    const ignoreList = ['download', 'settings', 'profile', 'admin', 'dashboard', 'api', 'v1', 'v2', 'user', 'projects'];
    if (ignoreList.includes(segment.toLowerCase())) {
        return false;
    }

    if (UUID_REGEX.test(segment)) return true;
    if (MONGO_ID_REGEX.test(segment)) return true;
    if (NUMERIC_ID_REGEX.test(segment)) return true;
    
    // If it's pure hex and reasonably long, it's likely an ID
    if (SHORT_HEX_ID_REGEX.test(segment) && !/^[a-zA-Z]+$/.test(segment)) {
         return true;
    }

    return false;
}

/**
 * Normalizes a URL path by replacing dynamic segments (IDs) with `:id`.
 * Example: /users/123/settings -> /users/:id/settings
 */
export function normalizeUrlPattern(urlOrPath: string): string {
    try {
        // Extract pathname if it's a full URL
        let pathname = urlOrPath;
        if (urlOrPath.startsWith('http')) {
             const url = new URL(urlOrPath);
             pathname = url.pathname;
        }

        // Clean up trailing/multiple slashes
        pathname = pathname
            .replace(/\/+$/, '') // strip trailing slash
            .replace(/\/+/g, '/') // collapse double slashes
            || '/'; // root

        if (pathname === '/') return pathname;

        const segments = pathname.split('/');
        const normalizedSegments = segments.map(segment => {
            if (isDynamicSegment(segment)) {
                return ':id';
            }
            return segment;
        });

        return normalizedSegments.join('/');
    } catch {
        return urlOrPath;
    }
}

/**
 * Converts a normalized pattern to a Regex for matching real URLs.
 * Example: /users/:id/settings -> ^\/users\/[^\/]+\/settings[\/]?$
 */
export function patternToRegex(pattern: string): RegExp {
    // Escape special regex chars, but leave :id alone for parsing
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    
    // Replace :id with a regex that matches any path segment
    const regexStr = escaped.replace(/:id/g, '[^/]+');
    
    // Exact match start and end, with optional trailing slash
    return new RegExp(`^${regexStr}[/]?$`);
}
