import type { WidgetConfig } from '@buginbox/shared';

export interface InitOptions {
  /** Public project key from the dashboard. Required. */
  projectKey: string;
  /**
   * Origin that serves the BugInbox API. Defaults to the origin the widget
   * script itself was loaded from, which is correct for the standard snippet.
   */
  apiBaseUrl?: string;
  /**
   * A short, safe label describing the current page, supplied by the host site.
   * Use this when the URL path itself is sensitive, or with a hash router.
   */
  pageContext?: string;
  /** Called once configuration has loaded and the widget is ready. */
  onReady?: () => void;
  /** Called after a report has been durably accepted by the server. */
  onSubmitted?: (reportId: string) => void;
}

export interface WidgetApi {
  readonly version: string;
  init(options: InitOptions): void;
  open(): void;
  close(): void;
  show(): void;
  hide(): void;
  destroy(): void;
  setPageContext(context: string | null): void;
  /** Present for debugging and the integration fixture; not a stable contract. */
  readonly state: () => WidgetState;
}

export interface WidgetState {
  initialised: boolean;
  configLoaded: boolean;
  eligible: boolean;
  reason: string;
  launcherVisible: boolean;
  formOpen: boolean;
  config: WidgetConfig | null;
}
