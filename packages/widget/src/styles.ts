/**
 * All widget CSS lives inside the shadow root, so the host page's styles cannot
 * reach it and it cannot leak into the host page. Every value is explicit
 * because the shadow root inherits nothing useful from the document.
 */
export const WIDGET_CSS = `
:host {
  all: initial;
}

*, *::before, *::after {
  box-sizing: border-box;
}

.bi-root {
  --bi-accent: #2f6df6;
  --bi-accent-contrast: #ffffff;
  --bi-surface: #ffffff;
  --bi-surface-muted: #f4f5f7;
  --bi-text: #16181d;
  --bi-text-muted: #5b6270;
  --bi-border: #d9dce3;
  --bi-danger: #b42318;
  --bi-shadow: 0 12px 32px rgba(15, 18, 25, 0.18);
  --bi-radius: 12px;

  position: fixed;
  z-index: 2147483000;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  font-size: 15px;
  line-height: 1.45;
  color: var(--bi-text);
  -webkit-font-smoothing: antialiased;
}

.bi-root[data-theme="dark"] {
  --bi-surface: #1b1e25;
  --bi-surface-muted: #23272f;
  --bi-text: #f2f4f8;
  --bi-text-muted: #a6adba;
  --bi-border: #353a45;
  --bi-shadow: 0 12px 32px rgba(0, 0, 0, 0.45);
}

.bi-launcher {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  margin: 0;
  padding: 11px 16px;
  border-radius: 999px;
  background: var(--bi-accent);
  color: var(--bi-accent-contrast);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  box-shadow: var(--bi-shadow);
  transition: transform 120ms ease, filter 120ms ease;
  max-width: 260px;
}

.bi-launcher:hover { filter: brightness(1.06); }
.bi-launcher:active { transform: translateY(1px); }
.bi-launcher:focus-visible { outline: 3px solid var(--bi-accent); outline-offset: 3px; }

.bi-launcher-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bi-launcher svg { flex: 0 0 auto; }

.bi-panel {
  width: 360px;
  max-width: calc(100vw - 24px);
  background: var(--bi-surface);
  border: 1px solid var(--bi-border);
  border-radius: var(--bi-radius);
  box-shadow: var(--bi-shadow);
  overflow: hidden;
}

.bi-panel-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 16px 8px;
}

.bi-title {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
}

.bi-subtitle {
  margin: 2px 0 0;
  font-size: 13px;
  color: var(--bi-text-muted);
}

.bi-close {
  border: 0;
  background: transparent;
  color: var(--bi-text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  line-height: 0;
  flex: 0 0 auto;
}
.bi-close:hover { background: var(--bi-surface-muted); color: var(--bi-text); }
.bi-close:focus-visible { outline: 2px solid var(--bi-accent); outline-offset: 2px; }

.bi-form { padding: 8px 16px 16px; display: grid; gap: 12px; }

.bi-field { display: grid; gap: 5px; }

.bi-label {
  font-size: 13px;
  font-weight: 600;
}

.bi-optional { font-weight: 400; color: var(--bi-text-muted); }

.bi-input, .bi-textarea {
  width: 100%;
  font: inherit;
  font-size: 14px;
  color: var(--bi-text);
  background: var(--bi-surface);
  border: 1px solid var(--bi-border);
  border-radius: 8px;
  padding: 9px 10px;
}

.bi-textarea { min-height: 96px; resize: vertical; }

.bi-input:focus, .bi-textarea:focus {
  outline: 2px solid var(--bi-accent);
  outline-offset: 0;
  border-color: var(--bi-accent);
}

.bi-hint {
  font-size: 12px;
  color: var(--bi-text-muted);
  display: flex;
  justify-content: space-between;
  gap: 8px;
}

.bi-error {
  font-size: 12.5px;
  color: var(--bi-danger);
  font-weight: 500;
}

.bi-file-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.bi-file-button {
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid var(--bi-border);
  background: var(--bi-surface-muted);
  color: var(--bi-text);
  cursor: pointer;
}
.bi-file-button:focus-visible { outline: 2px solid var(--bi-accent); outline-offset: 2px; }

.bi-file-input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }

.bi-preview {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border: 1px solid var(--bi-border);
  border-radius: 8px;
  background: var(--bi-surface-muted);
}

.bi-preview img {
  width: 46px;
  height: 46px;
  object-fit: cover;
  border-radius: 6px;
  display: block;
}

.bi-preview-meta { flex: 1 1 auto; min-width: 0; font-size: 12.5px; color: var(--bi-text-muted); }
.bi-preview-name { color: var(--bi-text); font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.bi-submit {
  font: inherit;
  font-weight: 650;
  font-size: 14px;
  padding: 10px 14px;
  border-radius: 8px;
  border: 0;
  background: var(--bi-accent);
  color: var(--bi-accent-contrast);
  cursor: pointer;
}
.bi-submit:disabled { opacity: 0.6; cursor: progress; }
.bi-submit:focus-visible { outline: 3px solid var(--bi-accent); outline-offset: 2px; }

.bi-footnote { font-size: 11.5px; color: var(--bi-text-muted); margin: 0; }

.bi-success { padding: 22px 16px 20px; text-align: center; display: grid; gap: 10px; justify-items: center; }
.bi-success-icon { color: #067647; }
.bi-success h2 { margin: 0; font-size: 16px; }
.bi-success p { margin: 0; font-size: 13.5px; color: var(--bi-text-muted); }

.bi-visually-hidden {
  position: absolute;
  width: 1px; height: 1px;
  margin: -1px; padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}

@media (max-width: 480px) {
  .bi-panel { width: calc(100vw - 20px); }
  .bi-launcher { max-width: calc(100vw - 32px); }
}

@media (prefers-reduced-motion: reduce) {
  .bi-launcher { transition: none; }
}
`;
