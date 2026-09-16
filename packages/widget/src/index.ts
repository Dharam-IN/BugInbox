import { BugInboxWidget } from './widget.js';
import type { InitOptions, WidgetApi, WidgetState } from './types.js';

declare const __BUGINBOX_VERSION__: string;

const VERSION = typeof __BUGINBOX_VERSION__ === 'string' ? __BUGINBOX_VERSION__ : '0.0.0-dev';

let instance: BugInboxWidget | null = null;

const EMPTY_STATE: WidgetState = {
  initialised: false,
  configLoaded: false,
  eligible: false,
  reason: 'The widget has not been initialised.',
  launcherVisible: false,
  formOpen: false,
  config: null,
};

// Captured while the bundle is evaluating, because document.currentScript is
// null by the time a DOMContentLoaded callback runs.
const ownScript = document.currentScript as HTMLScriptElement | null;

/** Work out the API origin from the script tag that loaded this bundle. */
function defaultApiBase(): string {
  const fromCurrent = ownScript?.src;
  if (fromCurrent) {
    try {
      return new URL(fromCurrent).origin;
    } catch {
      /* fall through */
    }
  }
  const tag = document.querySelector<HTMLScriptElement>('script[data-buginbox-key], script[data-project-key]');
  if (tag?.src) {
    try {
      return new URL(tag.src).origin;
    } catch {
      /* fall through */
    }
  }
  return window.location.origin;
}

const scriptOrigin = defaultApiBase();

function init(options: InitOptions): void {
  if (!options || typeof options.projectKey !== 'string' || options.projectKey === '') {
    // A misconfigured snippet must not throw into the host page.
    return;
  }
  // Re-initialising replaces the previous instance rather than stacking two.
  instance?.destroy();
  instance = new BugInboxWidget(options, options.apiBaseUrl ?? scriptOrigin);
  void instance.start();
}

const api: WidgetApi = {
  version: VERSION,
  init,
  open: () => instance?.open(),
  close: () => instance?.close(),
  show: () => instance?.show(),
  hide: () => instance?.hide(),
  destroy: () => {
    instance?.destroy();
    instance = null;
  },
  setPageContext: (context) => instance?.setPageContext(context),
  state: () => instance?.state() ?? EMPTY_STATE,
};

declare global {
  interface Window {
    BugInbox?: WidgetApi;
  }
}

window.BugInbox = api;

/**
 * Snippet auto-initialisation. A script tag carrying data-buginbox-key starts
 * the widget without any additional code on the host page.
 */
function autoInit(): void {
  const tag = ownScript ?? document.querySelector<HTMLScriptElement>('script[data-buginbox-key]');
  const projectKey = tag?.dataset.buginboxKey;
  if (!projectKey) return;
  init({
    projectKey,
    apiBaseUrl: tag?.dataset.buginboxApi,
    pageContext: tag?.dataset.buginboxPageContext,
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoInit, { once: true });
} else {
  autoInit();
}

export type { InitOptions, WidgetApi, WidgetState };
