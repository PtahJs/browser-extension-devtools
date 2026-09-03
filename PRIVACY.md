# Privacy Policy — PtahJs DevTools

**Last updated: 2026-09-03**

PtahJs DevTools is a browser extension that adds a DevTools panel for inspecting the `@ptahjs/tri` engine's internal `engine.store` (a `Map` of runtime state) during development.

## What we collect

**Nothing.** The extension does not collect, transmit, or sell any personal data, browsing history, page content, or telemetry.

## What the extension accesses

- **DevTools panel** — when you open the browser's DevTools and switch to the "Tri" panel, the extension reads a snapshot of the `tri` engine state from the inspected page (via `chrome.devtools.inspectedWindow`) and displays it locally in the panel UI. This data never leaves your browser.
- **`chrome.storage.local`** — used only to record a timestamp (`tri_devtools_loaded_at`) and panel-creation status (`tri_panel_status`) so the popup can confirm the extension loaded correctly. This data stays on your device and is never transmitted.

## Permissions

| Permission | Why |
| --- | --- |
| `storage` | Persist a load timestamp and panel status on the local device so the popup can display diagnostic state. |
| `devtools` (implied by `devtools_page`) | Create the "Tri" DevTools panel. |

## Third parties

The extension does not load any third-party scripts, analytics, or trackers. It does not communicate with any server.

## Data deletion

Uninstall the extension to remove all locally stored data. You can also clear it via `chrome://extensions` → "Remove" or by clearing extension storage in browser settings.

## Contact

Issues: https://github.com/Ptahjs/ptahjs/issues
