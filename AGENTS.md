# Agents

## Code Formatting

- After editing a CSS, JSON, JavaScript or a Python file, run `bunx --bun @biomejs/biome format --write --use-editorconfig=true <file>` to format the file.

## Userscripts & Bookmarklets

- Plain JavaScript
- No external dependencies; polyfils (inline) as a last resort
- Full compatibility with modern Safari WebKit, Chrome Blink, and Firefox Gecko; Only stable browser APIs
- Compatible with the Userscripts and Tampermonkey extensions

### Userscript Architecture

- All scripts share `window.__duckaiToolsOverlayMediator__` for shortcut coordination.
- All mutable state must live on `window[GLOBAL_KEY]`, not in module-scoped variables; The `initialized` guard ensures setup runs once per page load.

### IndexedDB

- Cache the connection on `state.dbPromise`, not a local variable.
- Always add a `versionchange` handler (`db.close(); state.dbPromise = null;`) to unblock schema upgrades from other tabs.

### Overlays

- Every overlay must: trap Tab focus between visible focusable elements, handle Escape, restore `previousFocus` on close.

### React Textarea Insertion

- Use `Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set` to set the value — direct assignment is intercepted by React and ignored.
- Dispatch both `input` and `change` events after setting.
- Respect `selectionStart`/`selectionEnd`: replace the selection when present, append otherwise.
