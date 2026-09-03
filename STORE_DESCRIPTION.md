PtahJs DevTools is a browser DevTools extension for developers building applications on the @ptahjs/tri WebGPU ECS engine. It adds a dedicated "Tri" panel to the browser's native DevTools that lets you inspect the engine's runtime state in real time — scenes, the internal `engine.store` Map, ECS entities and their components, registered systems, and the renderer configuration.

## Who is this for

This extension is only useful if you are developing or debugging an app built with `@ptahjs/tri`. If your page does not expose `window.__TRI_DEVTOOLS__` (tri mounts this in dev or when the devtools flag is enabled), the panel will show a "waiting for snapshot" state. It does not work on arbitrary websites.

## What you can inspect

The panel exposes five tabs:

- **Scenes** — all scenes registered in the engine, their entity counts, and active state.
- **Store** — the full `engine.store` Map. Search by id or value, click any row to see the complete JSON payload of that entry, with a diff badge highlighting entries that changed since the last snapshot.
- **Entities** — every ECS entity, which scene it belongs to, which components and systems are attached to it. Filter by id, component, or scene.
- **Systems** — registered ECS systems, matched entity counts, and their `requiredComponents`.
- **Renderer** — the current renderer configuration as a live JSON view.

Refresh can be automatic (200ms / 500ms / 1s / 2s) or triggered manually. A latency indicator shows how long the last snapshot took to pull.

## How to use

1. Install the extension.
2. Open the app you want to inspect (it must be a page running a `@ptahjs/tri` engine that exposes `window.__TRI_DEVTOOLS__`).
3. Open the browser DevTools (F12).
4. Find the "Tri" panel in the DevTools tab bar (it may be under the » overflow menu on the far right).
5. The panel connects automatically and starts streaming snapshots.

## Privacy

The extension does not collect, transmit, or sell any user data. It reads engine state from the inspected page via `chrome.devtools.inspectedWindow` and only uses `chrome.storage.local` to record a load timestamp and panel-creation status for diagnostics. See the full privacy policy at the project homepage.

## Compatibility

- Chrome / Edge / other Chromium browsers: MV3, version 111+ recommended.
- Firefox: 109+ (uses the `browser_specific_settings.gecko` id `ptahjs-devtools@ptahjs.com`).

## Links

- Source code & issues: https://github.com/Ptahjs
- Privacy policy: https://github.com/PtahJs/browser-extension-devtools/blob/main/PRIVACY.md
