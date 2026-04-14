(() => {
  const HOST_ID = "notes-reference-panel-root";
  const STORAGE_KEY = "notes-reference-panel-state-v1";
  const MAX_Z_INDEX = "2147483647";
  const DEFAULT_STATE = {
    top: 24,
    right: 24,
    width: 320,
    height: 240,
    minimized: false
  };
  const PANEL_TITLE = "Notes reference";
  const NOTES_SELECTORS = [
    '[aria-label*="notes" i]',
    '[title*="notes" i]',
    '[data-testid*="notes" i]',
    '[data-test*="notes" i]',
    '[data-qa*="notes" i]',
    '[id*="notes" i]',
    '[class*="notes" i]',
    '[name*="notes" i]'
  ];
  const CONTAINER_SELECTOR = [
    '[role="tabpanel"]',
    '[role="region"]',
    '[role="dialog"]',
    'section',
    'aside',
    'article',
    'main',
    'form',
    'div'
  ].join(", ");
  const TEXT_LABEL_SELECTOR = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "label",
    "legend",
    "button",
    "[role=\"tab\"]",
    "[role=\"heading\"]",
    "strong",
    "summary",
    "span",
    "div"
  ].join(", ");

  if (window.__notesReferencePanelInstalled || document.getElementById(HOST_ID)) {
    return;
  }
  window.__notesReferencePanelInstalled = true;

  let state = { ...DEFAULT_STATE };
  let host;
  let contentNode;
  let statusNode;
  let minimizeButton;
  let observer;
  let refreshTimer = null;
  let lastRenderedText = "";

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeText(text) {
    return text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  }

  function isElementVisible(element) {
    if (!element || !document.contains(element)) {
      return false;
    }
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") {
      return false;
    }
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function isInInjectedPanel(element) {
    return Boolean(element && host && host.contains(element));
  }

  function getVisibleText(element) {
    if (!element || isInInjectedPanel(element) || !isElementVisible(element)) {
      return "";
    }
    return normalizeText(element.innerText || element.textContent || "");
  }

  function hasNotesMarker(element) {
    const attributes = [
      element.id,
      element.className,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("data-testid"),
      element.getAttribute("data-test"),
      element.getAttribute("data-qa"),
      element.getAttribute("name")
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return attributes.includes("notes");
  }

  function findCandidateContainer(startElement) {
    let current = startElement;
    while (current && current !== document.body) {
      if (isInInjectedPanel(current)) {
        return null;
      }
      const text = getVisibleText(current);
      if (text.length > 20) {
        return current;
      }
      current = current.parentElement?.closest(CONTAINER_SELECTOR) || current.parentElement;
    }
    return null;
  }

  function scoreCandidate(element, text) {
    const length = text.length;
    let score = 0;

    if (hasNotesMarker(element)) {
      score += 90;
    }

    const heading = element.querySelector(
      'h1, h2, h3, h4, h5, h6, label, legend, [role="heading"], [role="tab"]'
    );
    if (heading && /\bnotes\b/i.test(heading.textContent || "")) {
      score += 60;
    }

    if (/\bnotes\b/i.test((element.textContent || "").slice(0, 250))) {
      score += 20;
    }

    if (element.matches('[role="tabpanel"], [role="region"], section, aside, article')) {
      score += 20;
    }

    if (length >= 40) {
      score += Math.min(length / 40, 60);
    }

    if (length > 8000) {
      score -= 40;
    }

    return score;
  }

  function collectCandidates() {
    const candidates = new Set();

    document.querySelectorAll(NOTES_SELECTORS.join(", ")).forEach((element) => {
      if (!isInInjectedPanel(element) && isElementVisible(element)) {
        candidates.add(element);
        const container = findCandidateContainer(element);
        if (container) {
          candidates.add(container);
        }
      }
    });

    document.querySelectorAll(TEXT_LABEL_SELECTOR).forEach((element) => {
      if (isInInjectedPanel(element) || !isElementVisible(element)) {
        return;
      }
      const text = normalizeText(element.textContent || "");
      if (!/\bnotes\b/i.test(text) || text.length > 80) {
        return;
      }
      const container = findCandidateContainer(element);
      if (container) {
        candidates.add(container);
      }
    });

    return Array.from(candidates);
  }

  function findNotesPanelText() {
    const candidates = collectCandidates()
      .map((element) => {
        const text = getVisibleText(element);
        return {
          element,
          text,
          score: scoreCandidate(element, text)
        };
      })
      .filter((candidate) => candidate.text.length > 0)
      .sort((left, right) => right.score - left.score);

    if (!candidates.length) {
      return "";
    }

    return candidates[0].text;
  }

  async function loadState() {
    if (!chrome?.storage?.local) {
      return;
    }
    try {
      const result = await chrome.storage.local.get(STORAGE_KEY);
      if (result && result[STORAGE_KEY]) {
        state = { ...DEFAULT_STATE, ...result[STORAGE_KEY] };
      }
    } catch (error) {
      console.warn("Notes Reference Panel: unable to load state", error);
    }
  }

  async function saveState() {
    if (!chrome?.storage?.local) {
      return;
    }
    try {
      await chrome.storage.local.set({
        [STORAGE_KEY]: state
      });
    } catch (error) {
      console.warn("Notes Reference Panel: unable to save state", error);
    }
  }

  function applyPanelState() {
    if (!host) {
      return;
    }

    const maxTop = Math.max(8, window.innerHeight - 40);
    const maxRight = Math.max(8, window.innerWidth - 40);

    state.top = clamp(state.top, 8, maxTop);
    state.right = clamp(state.right, 8, maxRight);

    host.style.top = `${state.top}px`;
    host.style.right = `${state.right}px`;

    const panel = host.shadowRoot.querySelector(".panel");
    panel.style.width = `${clamp(state.width, 220, Math.max(220, window.innerWidth - 32))}px`;
    panel.style.height = state.minimized
      ? "auto"
      : `${clamp(state.height, 120, Math.max(120, window.innerHeight - 32))}px`;
    panel.classList.toggle("minimized", state.minimized);
    minimizeButton.textContent = state.minimized ? "Expand" : "Minimize";
    contentNode.hidden = state.minimized;
  }

  function renderText(text) {
    if (text === lastRenderedText) {
      return;
    }
    lastRenderedText = text;

    if (!text) {
      contentNode.textContent =
        "Notes panel not detected. The panel will refresh automatically when Notes becomes available.";
      statusNode.textContent = "Waiting for Notes";
      return;
    }

    contentNode.textContent = text;
    statusNode.textContent = "Showing page Notes";
  }

  function refreshNotes() {
    const text = findNotesPanelText();
    renderText(text);
  }

  function scheduleRefresh() {
    if (refreshTimer) {
      window.clearTimeout(refreshTimer);
    }
    refreshTimer = window.setTimeout(() => {
      refreshTimer = null;
      refreshNotes();
    }, 150);
  }

  function attachDragBehavior(handle) {
    handle.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || event.target.closest("button")) {
        return;
      }

      const startTop = state.top;
      const startRight = state.right;
      const startX = event.clientX;
      const startY = event.clientY;

      handle.setPointerCapture(event.pointerId);

      const onMove = (moveEvent) => {
        state.top = clamp(startTop + (moveEvent.clientY - startY), 8, Math.max(8, window.innerHeight - 40));
        state.right = clamp(startRight - (moveEvent.clientX - startX), 8, Math.max(8, window.innerWidth - 40));
        applyPanelState();
      };

      const onUp = async () => {
        handle.removeEventListener("pointermove", onMove);
        handle.removeEventListener("pointerup", onUp);
        handle.removeEventListener("pointercancel", onUp);
        await saveState();
      };

      handle.addEventListener("pointermove", onMove);
      handle.addEventListener("pointerup", onUp);
      handle.addEventListener("pointercancel", onUp);
    });
  }

  function createUi() {
    host = document.createElement("div");
    host.id = HOST_ID;
    host.style.position = "fixed";
    host.style.top = `${state.top}px`;
    host.style.right = `${state.right}px`;
    host.style.zIndex = MAX_Z_INDEX;
    host.style.pointerEvents = "auto";

    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host {
          all: initial;
        }

        .panel {
          box-sizing: border-box;
          width: 320px;
          height: 240px;
          display: flex;
          flex-direction: column;
          color: #e5eef7;
          background: rgba(15, 23, 42, 0.96);
          border: 1px solid rgba(148, 163, 184, 0.45);
          border-radius: 10px;
          box-shadow: 0 12px 28px rgba(15, 23, 42, 0.35);
          backdrop-filter: blur(8px);
          overflow: hidden;
          resize: both;
          min-width: 220px;
          min-height: 120px;
          font-family: Arial, sans-serif;
        }

        .panel.minimized {
          resize: none;
        }

        .header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 8px 10px;
          background: rgba(30, 41, 59, 0.98);
          border-bottom: 1px solid rgba(148, 163, 184, 0.24);
          cursor: move;
          user-select: none;
        }

        .title {
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .actions {
          display: flex;
          gap: 6px;
        }

        button {
          all: unset;
          box-sizing: border-box;
          padding: 2px 6px;
          border-radius: 6px;
          font-size: 10px;
          line-height: 1.4;
          color: #cbd5e1;
          background: rgba(51, 65, 85, 0.95);
          cursor: pointer;
        }

        button:hover {
          background: rgba(71, 85, 105, 0.98);
        }

        .status {
          padding: 6px 10px 0;
          font-size: 10px;
          color: #94a3b8;
        }

        .content {
          flex: 1;
          overflow: auto;
          padding: 8px 10px 10px;
          font-size: 11px;
          line-height: 1.4;
          white-space: pre-wrap;
          word-break: break-word;
          overscroll-behavior: contain;
        }
      </style>
      <div class="panel">
        <div class="header">
          <div class="title">${PANEL_TITLE}</div>
          <div class="actions">
            <button type="button" data-action="refresh">Refresh</button>
            <button type="button" data-action="minimize">Minimize</button>
          </div>
        </div>
        <div class="status">Waiting for Notes</div>
        <div class="content"></div>
      </div>
    `;

    const panel = shadow.querySelector(".panel");
    const header = shadow.querySelector(".header");
    const refreshButton = shadow.querySelector('[data-action="refresh"]');
    minimizeButton = shadow.querySelector('[data-action="minimize"]');
    statusNode = shadow.querySelector(".status");
    contentNode = shadow.querySelector(".content");

    refreshButton.addEventListener("click", refreshNotes);
    minimizeButton.addEventListener("click", async () => {
      state.minimized = !state.minimized;
      applyPanelState();
      await saveState();
    });

    attachDragBehavior(header);

    const resizeObserver = new ResizeObserver(async () => {
      if (state.minimized) {
        return;
      }
      const rect = panel.getBoundingClientRect();
      state.width = Math.round(rect.width);
      state.height = Math.round(rect.height);
      await saveState();
    });
    resizeObserver.observe(panel);

    document.documentElement.appendChild(host);
    applyPanelState();
  }

  function watchPage() {
    observer = new MutationObserver(() => {
      scheduleRefresh();
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      characterData: true
    });

    window.addEventListener("resize", () => {
      applyPanelState();
    });
  }

  async function init() {
    await loadState();
    createUi();
    refreshNotes();
    watchPage();
    window.setTimeout(refreshNotes, 750);
    window.setTimeout(refreshNotes, 2000);
    window.addEventListener("load", refreshNotes, { once: true });
  }

  init();
})();
