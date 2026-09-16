import {
  MESSAGE_MAX_LENGTH,
  MESSAGE_MIN_LENGTH,
  evaluateEligibility,
  type WidgetConfig,
} from '@buginbox/shared';
import { closeIconSvg, launcherIconSvg, successIconSvg } from './icons.js';
import { onNavigation } from './navigation.js';
import { WIDGET_CSS } from './styles.js';
import type { InitOptions, WidgetState } from './types.js';

const MOBILE_QUERY = '(max-width: 767px)';
const ACCEPTED_TYPES = ['image/png', 'image/jpeg'];

interface Draft {
  message: string;
  email: string;
  file: File | null;
}

function randomKey(): string {
  const cryptoApi = globalThis.crypto;
  if (cryptoApi && typeof cryptoApi.randomUUID === 'function') return cryptoApi.randomUUID().replace(/-/g, '');
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Set an inline style that host CSS cannot override. */
function important(element: HTMLElement, property: string, value: string): void {
  element.style.setProperty(property, value, 'important');
}

export class BugInboxWidget {
  private readonly options: InitOptions;
  private readonly apiBase: string;

  private config: WidgetConfig | null = null;
  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private root: HTMLDivElement | null = null;
  private launcher: HTMLButtonElement | null = null;
  private panel: HTMLDivElement | null = null;

  private messageInput: HTMLTextAreaElement | null = null;
  private emailInput: HTMLInputElement | null = null;
  private fileInput: HTMLInputElement | null = null;
  private previewBox: HTMLDivElement | null = null;
  private errorBox: HTMLParagraphElement | null = null;
  private counter: HTMLSpanElement | null = null;
  private submitButton: HTMLButtonElement | null = null;
  private formElement: HTMLFormElement | null = null;

  private draft: Draft = { message: '', email: '', file: null };
  private previewUrl: string | null = null;
  private dedupeKey = randomKey();

  private destroyed = false;
  private formOpen = false;
  private submitting = false;
  private hiddenByApi = false;
  private launcherRevealed = false;
  private pageContext: string | null = null;
  private lastPath = '';
  private eligible = false;
  private eligibilityReason = 'Not evaluated yet.';

  private delayTimer: number | null = null;
  private abortController: AbortController | null = null;
  private cleanups: Array<() => void> = [];
  private returnFocusTo: Element | null = null;

  constructor(options: InitOptions, apiBase: string) {
    this.options = options;
    this.apiBase = apiBase.replace(/\/+$/, '');
    this.pageContext = options.pageContext ?? null;
  }

  // ---------------------------------------------------------------- lifecycle

  async start(): Promise<void> {
    try {
      const response = await fetch(`${this.apiBase}/api/v1/widget/${encodeURIComponent(this.options.projectKey)}/config`, {
        method: 'GET',
        credentials: 'omit',
        mode: 'cors',
      });
      if (!response.ok) throw new Error(`config request failed with ${response.status}`);
      const payload = (await response.json()) as { config: WidgetConfig };
      if (this.destroyed) return;
      this.config = payload.config;
    } catch {
      // If BugInbox is unreachable or misconfigured the host page carries on
      // exactly as before: nothing is rendered and nothing is thrown.
      return;
    }

    this.buildUi();
    this.watchEnvironment();
    this.evaluate();
    this.scheduleLauncher();
    this.options.onReady?.();
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    if (this.delayTimer !== null) {
      window.clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
    this.abortController?.abort();
    this.abortController = null;

    for (const cleanup of this.cleanups.splice(0)) {
      try {
        cleanup();
      } catch {
        /* ignore */
      }
    }

    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }

    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.root = null;
    this.launcher = null;
    this.panel = null;
    this.formElement = null;
    this.formOpen = false;
  }

  // ------------------------------------------------------------------ host API

  open(): void {
    if (this.destroyed || !this.config) return;
    // `open` bypasses the launcher delay, but never the eligibility rules,
    // the device rules or the project's paused state.
    this.evaluate();
    if (!this.eligible) return;
    if (this.delayTimer !== null) {
      window.clearTimeout(this.delayTimer);
      this.delayTimer = null;
    }
    this.showForm();
  }

  close(): void {
    if (this.destroyed) return;
    this.hideForm();
  }

  show(): void {
    if (this.destroyed) return;
    this.hiddenByApi = false;
    this.launcherRevealed = true;
    this.render();
  }

  hide(): void {
    if (this.destroyed) return;
    this.hiddenByApi = true;
    this.render();
  }

  setPageContext(context: string | null): void {
    this.pageContext = context && context.trim() !== '' ? context.trim().slice(0, 200) : null;
  }

  state(): WidgetState {
    return {
      initialised: !this.destroyed,
      configLoaded: this.config !== null,
      eligible: this.eligible,
      reason: this.eligibilityReason,
      launcherVisible: this.launcherShouldShow(),
      formOpen: this.formOpen,
      config: this.config,
    };
  }

  // ---------------------------------------------------------------- eligibility

  private isMobile(): boolean {
    return window.matchMedia(MOBILE_QUERY).matches;
  }

  private evaluate(): void {
    if (!this.config) return;
    const verdict = evaluateEligibility({
      projectStatus: this.config.status,
      mobileEnabled: this.config.appearance.mobileEnabled,
      device: this.isMobile() ? 'mobile' : 'desktop',
      path: window.location.pathname,
      rules: this.config.rules,
    });
    this.eligible = verdict.eligible;
    this.eligibilityReason = verdict.reason;
    this.lastPath = window.location.pathname;

    if (!this.eligible && this.formOpen) {
      // Navigating onto an excluded page closes the form and prevents a
      // submission from a context the owner has ruled out.
      this.hideForm();
    }
    this.render();
  }

  private launcherShouldShow(): boolean {
    if (!this.config || this.destroyed) return false;
    if (!this.eligible) return false;
    if (!this.config.appearance.launcherEnabled) return false;
    if (this.hiddenByApi) return false;
    if (this.config.trigger.mode === 'manual' && !this.launcherRevealed) return false;
    if (this.config.trigger.mode === 'delay' && !this.launcherRevealed) return false;
    return true;
  }

  private scheduleLauncher(): void {
    if (!this.config) return;
    const { mode, delayMs } = this.config.trigger;
    if (mode === 'immediate') {
      this.launcherRevealed = true;
      this.render();
      return;
    }
    if (mode === 'delay') {
      this.delayTimer = window.setTimeout(() => {
        this.delayTimer = null;
        this.launcherRevealed = true;
        this.render();
      }, Math.min(Math.max(delayMs, 0), 60_000));
    }
    // "manual" waits for the host to call show() or open().
  }

  private watchEnvironment(): void {
    const reevaluate = () => {
      if (this.destroyed) return;
      if (window.location.pathname === this.lastPath) {
        this.render();
        return;
      }
      this.evaluate();
    };

    this.cleanups.push(onNavigation(reevaluate));

    const mobileQuery = window.matchMedia(MOBILE_QUERY);
    const onBreakpoint = () => {
      if (!this.destroyed) this.evaluate();
    };
    mobileQuery.addEventListener('change', onBreakpoint);
    this.cleanups.push(() => mobileQuery.removeEventListener('change', onBreakpoint));

    const schemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => this.render();
    schemeQuery.addEventListener('change', onScheme);
    this.cleanups.push(() => schemeQuery.removeEventListener('change', onScheme));
  }

  // ------------------------------------------------------------------------ UI

  private buildUi(): void {
    const config = this.config!;

    const host = document.createElement('div');
    host.setAttribute('data-buginbox', 'root');
    // The host element carries only positioning, all of it !important so the
    // surrounding page's CSS cannot move or hide it by accident.
    important(host, 'position', 'fixed');
    important(host, 'z-index', '2147483000');
    important(host, 'margin', '0');
    important(host, 'padding', '0');
    important(host, 'border', '0');
    important(host, 'width', 'auto');
    important(host, 'height', 'auto');
    important(host, 'max-width', 'none');
    important(host, 'transform', 'none');
    important(host, 'pointer-events', 'auto');

    const shadow = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = WIDGET_CSS;
    shadow.appendChild(style);

    const root = document.createElement('div');
    root.className = 'bi-root';
    root.style.position = 'static';
    shadow.appendChild(root);

    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'bi-launcher';
    launcher.setAttribute('aria-haspopup', 'dialog');
    launcher.appendChild(launcherIconSvg(config.appearance.icon));
    const label = document.createElement('span');
    label.className = 'bi-launcher-label';
    label.textContent = config.appearance.launcherText;
    launcher.appendChild(label);
    launcher.addEventListener('click', () => this.showForm());
    root.appendChild(launcher);

    const panel = this.buildPanel();
    root.appendChild(panel);

    shadow.addEventListener('keydown', (event) => this.onKeyDown(event as KeyboardEvent));

    document.body.appendChild(host);

    this.host = host;
    this.shadow = shadow;
    this.root = root;
    this.launcher = launcher;
    this.panel = panel;
  }

  private buildPanel(): HTMLDivElement {
    const config = this.config!;
    const panel = document.createElement('div');
    panel.className = 'bi-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-modal', 'false');
    panel.setAttribute('aria-labelledby', 'bi-title');
    panel.hidden = true;

    const header = document.createElement('div');
    header.className = 'bi-panel-header';
    const headings = document.createElement('div');
    const title = document.createElement('h2');
    title.className = 'bi-title';
    title.id = 'bi-title';
    title.textContent = 'Report a problem';
    const subtitle = document.createElement('p');
    subtitle.className = 'bi-subtitle';
    subtitle.textContent = 'Tell the site owner what went wrong.';
    headings.appendChild(title);
    headings.appendChild(subtitle);

    const closeButton = document.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'bi-close';
    closeButton.setAttribute('aria-label', 'Close the report form');
    closeButton.appendChild(closeIconSvg());
    closeButton.addEventListener('click', () => this.hideForm());

    header.appendChild(headings);
    header.appendChild(closeButton);
    panel.appendChild(header);

    const form = document.createElement('form');
    form.className = 'bi-form';
    form.noValidate = true;

    // Description ------------------------------------------------------------
    const messageField = document.createElement('div');
    messageField.className = 'bi-field';
    const messageLabel = document.createElement('label');
    messageLabel.className = 'bi-label';
    messageLabel.htmlFor = 'bi-message';
    messageLabel.textContent = 'What went wrong?';
    const textarea = document.createElement('textarea');
    textarea.className = 'bi-textarea';
    textarea.id = 'bi-message';
    textarea.name = 'message';
    textarea.required = true;
    textarea.maxLength = MESSAGE_MAX_LENGTH;
    textarea.setAttribute('aria-describedby', 'bi-message-hint');
    textarea.placeholder = 'Describe what you did and what happened.';
    textarea.addEventListener('input', () => {
      this.draft.message = textarea.value;
      this.updateCounter();
    });

    const hint = document.createElement('div');
    hint.className = 'bi-hint';
    hint.id = 'bi-message-hint';
    const hintText = document.createElement('span');
    hintText.textContent = `At least ${MESSAGE_MIN_LENGTH} characters.`;
    const counter = document.createElement('span');
    counter.textContent = `0/${MESSAGE_MAX_LENGTH}`;
    hint.appendChild(hintText);
    hint.appendChild(counter);

    messageField.appendChild(messageLabel);
    messageField.appendChild(textarea);
    messageField.appendChild(hint);
    form.appendChild(messageField);

    // Email ------------------------------------------------------------------
    const emailField = document.createElement('div');
    emailField.className = 'bi-field';
    const emailLabel = document.createElement('label');
    emailLabel.className = 'bi-label';
    emailLabel.htmlFor = 'bi-email';
    emailLabel.textContent = 'Your email ';
    const optional = document.createElement('span');
    optional.className = 'bi-optional';
    optional.textContent = '(optional)';
    emailLabel.appendChild(optional);
    const email = document.createElement('input');
    email.className = 'bi-input';
    email.id = 'bi-email';
    email.name = 'email';
    email.type = 'email';
    email.autocomplete = 'email';
    email.setAttribute('aria-describedby', 'bi-email-hint');
    email.placeholder = 'you@example.com';
    email.addEventListener('input', () => {
      this.draft.email = email.value;
    });
    const emailHint = document.createElement('div');
    emailHint.className = 'bi-hint';
    emailHint.id = 'bi-email-hint';
    emailHint.textContent = 'Only used if the site owner needs to follow up.';
    emailField.appendChild(emailLabel);
    emailField.appendChild(email);
    emailField.appendChild(emailHint);
    form.appendChild(emailField);

    // Screenshot -------------------------------------------------------------
    const fileField = document.createElement('div');
    fileField.className = 'bi-field';
    const fileLabel = document.createElement('span');
    fileLabel.className = 'bi-label';
    fileLabel.textContent = 'Screenshot ';
    const fileOptional = document.createElement('span');
    fileOptional.className = 'bi-optional';
    fileOptional.textContent = '(optional)';
    fileLabel.appendChild(fileOptional);

    const fileRow = document.createElement('div');
    fileRow.className = 'bi-file-row';
    const fileInput = document.createElement('input');
    fileInput.className = 'bi-file-input';
    fileInput.type = 'file';
    fileInput.id = 'bi-screenshot';
    fileInput.accept = 'image/png,image/jpeg';
    const fileButton = document.createElement('button');
    fileButton.type = 'button';
    fileButton.className = 'bi-file-button';
    fileButton.textContent = 'Choose an image';
    fileButton.addEventListener('click', () => fileInput.click());
    fileInput.addEventListener('change', () => this.onFileChosen(fileInput.files?.[0] ?? null));
    const fileHint = document.createElement('span');
    fileHint.className = 'bi-hint';
    fileHint.textContent = `PNG or JPEG, up to ${formatBytes(config.maxUploadBytes)}.`;

    fileRow.appendChild(fileButton);
    fileRow.appendChild(fileInput);
    fileRow.appendChild(fileHint);

    const preview = document.createElement('div');
    preview.className = 'bi-preview';
    preview.hidden = true;

    fileField.appendChild(fileLabel);
    fileField.appendChild(fileRow);
    fileField.appendChild(preview);
    form.appendChild(fileField);

    // Errors and submission ---------------------------------------------------
    const error = document.createElement('p');
    error.className = 'bi-error';
    error.setAttribute('role', 'alert');
    error.hidden = true;
    form.appendChild(error);

    const submit = document.createElement('button');
    submit.type = 'submit';
    submit.className = 'bi-submit';
    submit.textContent = 'Send report';
    form.appendChild(submit);

    const footnote = document.createElement('p');
    footnote.className = 'bi-footnote';
    footnote.textContent = config.collectPageUrl
      ? 'Sends your message, the page address without its query string, and basic browser information.'
      : 'Sends your message and basic browser information. The page address is not collected.';
    form.appendChild(footnote);

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void this.submit();
    });

    panel.appendChild(form);

    this.messageInput = textarea;
    this.emailInput = email;
    this.fileInput = fileInput;
    this.previewBox = preview;
    this.errorBox = error;
    this.counter = counter;
    this.submitButton = submit;
    this.formElement = form;

    return panel;
  }

  private render(): void {
    if (!this.config || !this.root || !this.host || !this.launcher) return;
    const appearance = this.config.appearance;
    const mobile = this.isMobile();
    const offsetX = mobile ? appearance.mobileOffsetX : appearance.offsetX;
    const offsetY = mobile ? appearance.mobileOffsetY : appearance.offsetY;

    for (const side of ['top', 'right', 'bottom', 'left']) this.host.style.removeProperty(side);
    const [vertical, horizontal] = appearance.position.split('-') as ['top' | 'bottom', 'left' | 'right'];
    important(this.host, vertical, `${offsetY}px`);
    important(this.host, horizontal, `${offsetX}px`);

    const dark =
      appearance.theme === 'dark' ||
      (appearance.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    this.root.dataset.theme = dark ? 'dark' : 'light';
    this.root.style.setProperty('--bi-accent', appearance.accentColor);

    // Panels open upwards from a bottom corner and downwards from a top corner.
    this.root.style.display = 'flex';
    this.root.style.flexDirection = vertical === 'bottom' ? 'column-reverse' : 'column';
    this.root.style.alignItems = horizontal === 'right' ? 'flex-end' : 'flex-start';
    this.root.style.gap = '10px';

    const showLauncher = this.launcherShouldShow();
    this.launcher.hidden = !showLauncher;
    if (this.panel) this.panel.hidden = !this.formOpen;

    // When nothing is visible the host element must not intercept clicks.
    important(this.host, 'pointer-events', showLauncher || this.formOpen ? 'auto' : 'none');
    this.host.style.setProperty('display', showLauncher || this.formOpen ? 'block' : 'none', 'important');
  }

  // -------------------------------------------------------------------- form

  private showForm(): void {
    if (!this.config || this.destroyed || !this.eligible) return;
    if (this.formOpen) return;
    // When focus is already inside the shadow root, document.activeElement is
    // the (non-focusable) host element, so read through to the real element.
    const active = document.activeElement;
    this.returnFocusTo = active === this.host ? (this.shadow?.activeElement ?? this.launcher) : active;
    this.formOpen = true;
    this.dedupeKey = randomKey();
    this.restoreDraft();
    this.showSuccess(false);
    this.render();
    window.setTimeout(() => this.messageInput?.focus(), 0);
  }

  private hideForm(): void {
    if (!this.formOpen) return;
    this.formOpen = false;
    this.abortController?.abort();
    this.abortController = null;
    this.submitting = false;
    if (this.submitButton) {
      this.submitButton.disabled = false;
      this.submitButton.textContent = 'Send report';
    }
    this.render();

    const target = this.returnFocusTo;
    this.returnFocusTo = null;
    if (target instanceof HTMLElement && target.isConnected && target !== this.host) {
      target.focus();
    } else if (this.launcher && !this.launcher.hidden) {
      this.launcher.focus();
    }
  }

  private restoreDraft(): void {
    if (this.messageInput) this.messageInput.value = this.draft.message;
    if (this.emailInput) this.emailInput.value = this.draft.email;
    this.updateCounter();
    this.renderPreview();
    this.setError(null);
  }

  private updateCounter(): void {
    if (!this.counter) return;
    this.counter.textContent = `${this.draft.message.length}/${MESSAGE_MAX_LENGTH}`;
  }

  private setError(message: string | null): void {
    if (!this.errorBox) return;
    this.errorBox.textContent = message ?? '';
    this.errorBox.hidden = message === null;
  }

  private onFileChosen(file: File | null): void {
    if (!file) return;
    const maxBytes = this.config?.maxUploadBytes ?? 5 * 1024 * 1024;
    if (!ACCEPTED_TYPES.includes(file.type)) {
      this.setError('Choose a PNG or JPEG image.');
      if (this.fileInput) this.fileInput.value = '';
      return;
    }
    if (file.size > maxBytes) {
      this.setError(`That image is ${formatBytes(file.size)}. The limit is ${formatBytes(maxBytes)}.`);
      if (this.fileInput) this.fileInput.value = '';
      return;
    }
    this.setError(null);
    this.draft.file = file;
    this.renderPreview();
  }

  private clearFile(): void {
    this.draft.file = null;
    if (this.fileInput) this.fileInput.value = '';
    this.renderPreview();
  }

  private renderPreview(): void {
    if (!this.previewBox) return;
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
      this.previewUrl = null;
    }
    this.previewBox.replaceChildren();

    const file = this.draft.file;
    if (!file) {
      this.previewBox.hidden = true;
      return;
    }

    this.previewUrl = URL.createObjectURL(file);
    const image = document.createElement('img');
    image.src = this.previewUrl;
    image.alt = '';

    const meta = document.createElement('div');
    meta.className = 'bi-preview-meta';
    const name = document.createElement('div');
    name.className = 'bi-preview-name';
    name.textContent = file.name;
    const size = document.createElement('div');
    size.textContent = formatBytes(file.size);
    meta.appendChild(name);
    meta.appendChild(size);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'bi-file-button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove the attached image ${file.name}`);
    remove.addEventListener('click', () => this.clearFile());

    this.previewBox.appendChild(image);
    this.previewBox.appendChild(meta);
    this.previewBox.appendChild(remove);
    this.previewBox.hidden = false;
  }

  private async submit(): Promise<void> {
    if (!this.config || this.submitting) return;

    // Re-check before sending: the page may have changed since the form opened.
    this.evaluate();
    if (!this.eligible) {
      this.setError('This page no longer accepts reports.');
      return;
    }

    const message = this.draft.message.trim();
    if (message.length < MESSAGE_MIN_LENGTH) {
      this.setError(`Please describe the problem in at least ${MESSAGE_MIN_LENGTH} characters.`);
      this.messageInput?.focus();
      return;
    }
    const email = this.draft.email.trim();
    if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      this.setError('That email address does not look right. Leave it blank if you prefer.');
      this.emailInput?.focus();
      return;
    }

    this.submitting = true;
    this.setError(null);
    if (this.submitButton) {
      this.submitButton.disabled = true;
      this.submitButton.textContent = 'Sending...';
    }

    const body = new FormData();
    body.set('message', message);
    if (email !== '') body.set('email', email);
    // The same key is reused for retries of this form, so a double click or a
    // retried request cannot create a second report.
    body.set('dedupeKey', this.dedupeKey);
    if (this.config.collectPageUrl) {
      // Query string and fragment are dropped before the request leaves the page.
      body.set('pageUrl', `${window.location.origin}${window.location.pathname}`);
    }
    if (this.pageContext) body.set('pageContext', this.pageContext);
    body.set('browser', JSON.stringify(this.browserContext()));
    if (this.draft.file) body.set('screenshot', this.draft.file, this.draft.file.name);

    this.abortController = new AbortController();
    try {
      const response = await fetch(
        `${this.apiBase}/api/v1/widget/${encodeURIComponent(this.options.projectKey)}/reports`,
        { method: 'POST', body, credentials: 'omit', mode: 'cors', signal: this.abortController.signal },
      );

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: { code?: string; message?: string } }
          | null;
        this.setError(payload?.error?.message ?? 'The report could not be sent. Please try again.');
        return;
      }

      const payload = (await response.json()) as { id: string };
      // Only now, once the server has durably accepted it, is the draft cleared.
      this.draft = { message: '', email: '', file: null };
      if (this.messageInput) this.messageInput.value = '';
      if (this.emailInput) this.emailInput.value = '';
      this.clearFile();
      this.updateCounter();
      this.showSuccess(true);
      this.options.onSubmitted?.(payload.id);
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return;
      // The draft stays in place so the reporter can try again.
      this.setError('The report could not be sent. Check your connection and try again.');
    } finally {
      this.submitting = false;
      this.abortController = null;
      if (this.submitButton) {
        this.submitButton.disabled = false;
        this.submitButton.textContent = 'Send report';
      }
    }
  }

  private showSuccess(show: boolean): void {
    if (!this.panel || !this.formElement) return;
    const existing = this.panel.querySelector('.bi-success');
    existing?.remove();
    this.formElement.hidden = show;

    if (!show) return;

    const success = document.createElement('div');
    success.className = 'bi-success';
    const icon = document.createElement('div');
    icon.className = 'bi-success-icon';
    icon.appendChild(successIconSvg());
    const heading = document.createElement('h2');
    heading.textContent = 'Report sent';
    const text = document.createElement('p');
    text.textContent = 'Thank you. The site owner has received it.';
    const done = document.createElement('button');
    done.type = 'button';
    done.className = 'bi-submit';
    done.textContent = 'Close';
    done.addEventListener('click', () => this.hideForm());

    success.appendChild(icon);
    success.appendChild(heading);
    success.appendChild(text);
    success.appendChild(done);
    success.setAttribute('role', 'status');
    this.panel.appendChild(success);
    window.setTimeout(() => done.focus(), 0);
  }

  private browserContext(): Record<string, unknown> {
    let timezone: string | undefined;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      timezone = undefined;
    }
    return {
      userAgent: navigator.userAgent.slice(0, 400),
      viewportWidth: Math.round(window.innerWidth),
      viewportHeight: Math.round(window.innerHeight),
      devicePixelRatio: Math.round((window.devicePixelRatio ?? 1) * 100) / 100,
      language: navigator.language?.slice(0, 35),
      timezone: timezone?.slice(0, 60),
      device: this.isMobile() ? 'mobile' : 'desktop',
    };
  }

  // -------------------------------------------------------------- keyboard

  private onKeyDown(event: KeyboardEvent): void {
    if (!this.formOpen || !this.panel) return;

    if (event.key === 'Escape') {
      event.stopPropagation();
      this.hideForm();
      return;
    }

    if (event.key !== 'Tab') return;

    const focusable = [...this.panel.querySelectorAll<HTMLElement>('button, textarea, input, a[href]')].filter(
      (element) => !element.hidden && element.offsetParent !== null && !element.hasAttribute('disabled'),
    );
    if (focusable.length === 0) return;

    const first = focusable[0]!;
    const last = focusable[focusable.length - 1]!;
    const active = this.shadow?.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }
}
