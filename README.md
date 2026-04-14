# panel_shower

Simple Chromium extension that injects a compact, draggable reference panel into a page and mirrors the visible text from the page's existing "Notes" panel.

## Files

- `manifest.json` - Manifest V3 definition for the unpacked Chromium extension.
- `content.js` - Content script that finds Notes content and injects the floating reference panel.

## Load in Chromium

1. Open `chrome://extensions/`.
2. Enable **Developer mode**.
3. Choose **Load unpacked**.
4. Select the folder where you cloned this repository.

## Current assumptions

- The target site was not specified, so the extension is currently configured to run on all pages.
- The page already contains a visible Notes area that can be discovered from labels, roles, ids, classes, `aria-*` attributes, or headings containing the word `Notes`.
- The injected panel is read-only and intended only as a compact reference copy of the page's existing Notes text.
- If the Notes area is rendered late or changes after load, the content script re-checks the page and refreshes the injected panel automatically.
