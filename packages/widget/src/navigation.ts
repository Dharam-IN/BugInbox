type Listener = () => void;

const listeners = new Set<Listener>();
let installed = false;
let originalPushState: typeof history.pushState | null = null;
let originalReplaceState: typeof history.replaceState | null = null;

function notify(): void {
  for (const listener of [...listeners]) {
    try {
      listener();
    } catch {
      /* a listener failure must not break the host's navigation */
    }
  }
}

/**
 * Watch for navigation in ordinary sites and in SPA routers.
 *
 * `history.pushState` and `history.replaceState` are wrapped once per page, no
 * matter how many times the widget is initialised, and the originals are put
 * back when the last listener goes away. The wrappers call through first and
 * never swallow errors, so the host router is unaffected.
 */
export function onNavigation(listener: Listener): () => void {
  listeners.add(listener);

  if (!installed) {
    installed = true;
    originalPushState = history.pushState;
    originalReplaceState = history.replaceState;

    history.pushState = function patchedPushState(this: History, ...args: Parameters<History['pushState']>) {
      const result = originalPushState!.apply(this, args);
      notify();
      return result;
    };
    history.replaceState = function patchedReplaceState(this: History, ...args: Parameters<History['replaceState']>) {
      const result = originalReplaceState!.apply(this, args);
      notify();
      return result;
    };
    window.addEventListener('popstate', notify);
  }

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && installed) {
      installed = false;
      if (originalPushState) history.pushState = originalPushState;
      if (originalReplaceState) history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', notify);
      originalPushState = null;
      originalReplaceState = null;
    }
  };
}
