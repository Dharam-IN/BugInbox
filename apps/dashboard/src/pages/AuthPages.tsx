import { useEffect, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resources } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { ErrorNotice, Notice } from '../components/ui.tsx';
import { ThemeSelector } from '../components/ThemeSelector.tsx';

const MIN_PASSWORD = 12;

/**
 * Accessible password field with a reveal control.
 *
 * The input keeps its name, id and autocomplete attributes when toggled, so
 * password managers still recognise and fill it.
 */
function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  hint?: ReactNode;
  minLength?: number;
}) {
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="field">
      <label className="field-label" htmlFor={fieldId}>
        {label}
      </label>
      <span className="password-field">
        <input
          id={fieldId}
          name={autoComplete === 'current-password' ? 'password' : 'new-password'}
          type={revealed ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          value={value}
          aria-describedby={hint ? hintId : undefined}
          onChange={(event) => onChange(event.target.value)}
        />
        <button
          type="button"
          className="password-toggle"
          aria-pressed={revealed}
          aria-controls={fieldId}
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? 'Hide' : 'Show'}
          <span className="visually-hidden"> password</span>
        </button>
      </span>
      {hint ? (
        <span className="field-hint" id={hintId}>
          {hint}
        </span>
      ) : null}
    </div>
  );
}

const POINTS = [
  'One script tag on your website — nothing else to run.',
  'Visitors report a problem without creating an account.',
  'Every report arrives with the page, the browser and an optional screenshot.',
];

/** Branded two-column composition on desktop, single column on mobile. */
function AuthLayout({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  // Same reason as the dashboard shell: these are routes in one document, so
  // the tab would otherwise keep showing the homepage title.
  useEffect(() => {
    document.title = `${title} · BugInbox`;
  }, [title]);

  return (
    <div className="auth-split">
      <aside className="auth-aside">
        <div className="auth-aside-inner">
          <Link className="brand" to="/">
            <span className="brand-mark" aria-hidden="true">
              B
            </span>
            BugInbox
          </Link>
          <h2>Collect website bug reports with the context you need.</h2>
          <p>BugInbox is a self-hosted feedback tool for people who look after several websites. You run it yourself.</p>
          <ul className="auth-points">
            {POINTS.map((point) => (
              <li key={point}>
                <span className="tick" aria-hidden="true">
                  ✓
                </span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <div className="auth-panel">
        <div className="auth-panel-top">
          <Link className="brand" to="/">
            <span className="brand-mark" aria-hidden="true">
              B
            </span>
            BugInbox
          </Link>
          <ThemeSelector compact />
        </div>

        <main className="auth-form-wrap" id="main">
          <div>
            <h1>{title}</h1>
            {subtitle ? <p className="sub">{subtitle}</p> : null}
          </div>
          {children}
          {footer ? <div className="field-hint">{footer}</div> : null}
        </main>
      </div>
    </div>
  );
}

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resources.login(email, password);
      await auth.refresh();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Manage the websites you collect feedback for."
      footer={
        <>
          <Link to="/forgot-password">Forgotten your password?</Link> · New here?{' '}
          <Link to="/signup">Create an account</Link>
        </>
      }
    >
      <form className="form-grid" onSubmit={onSubmit}>
        <ErrorNotice error={error} />
        <label className="field">
          <span className="field-label">Email address</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <PasswordField label="Password" autoComplete="current-password" value={password} onChange={setPassword} />
        <button className="button" type="submit" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </AuthLayout>
  );
}

export function SignupPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const tooShort = password.length > 0 && password.length < MIN_PASSWORD;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (password.length < MIN_PASSWORD) return;
    setBusy(true);
    setError(null);
    try {
      await resources.signup(email, password);
      await auth.refresh();
      navigate('/dashboard', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="One account, as many website projects as you need."
      footer={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form className="form-grid" onSubmit={onSubmit}>
        <ErrorNotice error={error} />
        <label className="field">
          <span className="field-label">Email address</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <span className="field-hint">Report notifications are sent here.</span>
        </label>
        <PasswordField
          label="Password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
          minLength={MIN_PASSWORD}
          hint={
            tooShort ? `${MIN_PASSWORD - password.length} more characters needed.` : `At least ${MIN_PASSWORD} characters.`
          }
        />
        <button className="button" type="submit" disabled={busy || password.length < MIN_PASSWORD}>
          {busy ? 'Creating account…' : 'Create account'}
        </button>
      </form>
    </AuthLayout>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resources.requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a link if the address is registered."
      footer={<Link to="/login">Back to sign in</Link>}
    >
      {sent ? (
        <Notice kind="success">
          If that address has an account, a reset link is on its way. The link is valid for one hour.
        </Notice>
      ) : (
        <form className="form-grid" onSubmit={onSubmit}>
          <ErrorNotice error={error} />
          <label className="field">
            <span className="field-label">Email address</span>
            <input
              type="email"
              name="email"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <button className="button" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await resources.resetPassword(token, password);
      setDone(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      // A reset link is only valid for an hour, so arriving with an expired or
      // truncated one is ordinary. Without these the page was a dead end: an
      // error message and no way to ask for another link.
      footer={
        <>
          <Link to="/forgot-password">Send me a new reset link</Link> · <Link to="/login">Back to sign in</Link>
        </>
      }
    >
      {!token ? (
        <Notice kind="error">
          This link is missing its token. It may have been cut in half by your email client — copy the whole address, or
          request a new one below.
        </Notice>
      ) : done ? (
        <>
          <Notice kind="success">Your password has been changed and every existing session was signed out.</Notice>
          <p className="field-hint" style={{ marginTop: 14 }}>
            <Link to="/login">Sign in with your new password</Link>
          </p>
        </>
      ) : (
        <form className="form-grid" onSubmit={onSubmit}>
          <ErrorNotice error={error} />
          <PasswordField
            label="New password"
            autoComplete="new-password"
            value={password}
            onChange={setPassword}
            minLength={MIN_PASSWORD}
            hint={`At least ${MIN_PASSWORD} characters.`}
          />
          <button className="button" type="submit" disabled={busy || password.length < MIN_PASSWORD}>
            {busy ? 'Saving…' : 'Change password'}
          </button>
        </form>
      )}
    </AuthLayout>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const auth = useAuth();
  const refresh = auth.refresh;
  const owner = auth.owner;
  const token = params.get('token') ?? '';
  const [state, setState] = useState<'pending' | 'ok' | 'failed'>('pending');
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    if (!token) {
      setState('failed');
      setError(new Error('This confirmation link is missing its token.'));
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        await resources.verifyEmail(token);
        if (cancelled) return;
        setState('ok');
        await refresh();
      } catch (err) {
        if (cancelled) return;
        setError(err);
        setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
    // `refresh` is stable, so this runs once per confirmation link.
  }, [token, refresh]);

  return (
    <AuthLayout title="Confirm your email address">
      {state === 'pending' ? <p className="muted">Checking your confirmation link…</p> : null}
      {state === 'ok' ? (
        <>
          <Notice kind="success">Your email address is confirmed.</Notice>
          <p className="field-hint" style={{ marginTop: 14 }}>
            <Link to="/dashboard">Go to your dashboard</Link>
          </p>
        </>
      ) : null}
      {state === 'failed' ? (
        <>
          <ErrorNotice error={error} />
          {/* Confirmation links last 24 hours and are single-use, so this page
              is reached often. It has to work for a reader who is signed out
              in this browser as well as one who is signed in. */}
          <p className="field-hint" style={{ marginTop: 14 }}>
            {owner ? (
              <>
                Open <Link to="/account">your account</Link> to send a fresh link.
              </>
            ) : (
              <>
                <Link to="/login">Sign in</Link>, then open your account page to send a fresh link.
              </>
            )}
          </p>
        </>
      ) : null}
    </AuthLayout>
  );
}
