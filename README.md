# @thias/navigation

A navigation layer designed to turn any website into a chat-first interface. This package provides robust abstractions for observing route changes, executing navigation steps safely, maintaining a product graph, and taking page snapshots for AI agents.

## Features

- **RouteObserver**: Safely monitor pushState/replaceState and popstate events.
- **SafetyLayer**: Validate URLs and actions before execution.
- **GraphManager**: Maintain and query a graph of known application states.
- **NavigationExecutor**: Perform safe navigation operations and interact with the DOM.
- **LinkCrawler**: Find and extract interactable elements on the page.

## Installation

```bash
npm install @thias/navigation
```

## Usage

```typescript
import { NavigationExecutor, GraphManager, RouteObserver } from '@thias/navigation';

// Initialization example
const graphManager = new GraphManager();
// ...
```

## License

MIT
