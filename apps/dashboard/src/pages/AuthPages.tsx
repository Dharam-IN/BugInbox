import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resources } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { Card, CardHeader, ErrorNotice, Notice } from '../components/ui.tsx';

const MIN_PASSWORD = 12;

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="content narrow" style={{ paddingTop: 48 }}>
      <div className="brand" style={{ justifyContent: 'center', marginBottom: 20 }}>
        <span className="brand-mark" aria-hidden="true">
          B
        </span>
        BugInbox
      </div>
      {children}
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
      navigate('/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader title="Sign in" subtitle="Manage the websites you collect feedback for." />
        <form className="stack" onSubmit={onSubmit}>
          <ErrorNotice error={error} />
          <label className="field">
            <span className="field-label">Email address</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="button" type="submit" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <p className="field-hint" style={{ marginTop: 14 }}>
          <Link to="/forgot-password">Forgotten your password?</Link> · New here?{' '}
          <Link to="/signup">Create an account</Link>
        </p>
      </Card>
    </AuthShell>
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
      navigate('/', { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <Card>
        <CardHeader title="Create your account" subtitle="One account, as many website projects as you need." />
        <form className="stack" onSubmit={onSubmit}>
          <ErrorNotice error={error} />
          <label className="field">
            <span className="field-label">Email address</span>
            <input
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <span className="field-hint">We send report notifications here.</span>
          </label>
          <label className="field">
            <span className="field-label">Password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-describedby="password-hint"
            />
            <span className="field-hint" id="password-hint">
              {tooShort ? `${MIN_PASSWORD - password.length} more characters needed.` : `At least ${MIN_PASSWORD} characters.`}
            </span>
          </label>
          <button className="button" type="submit" disabled={busy || password.length < MIN_PASSWORD}>
            {busy ? 'Creating account…' : 'Create account'}
          </button>
        </form>
        <p className="field-hint" style={{ marginTop: 14 }}>
          Already have an account? <Link to="/login">Sign in</Link>
        </p>
      </Card>
    </AuthShell>
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
    <AuthShell>
      <Card>
        <CardHeader title="Reset your password" subtitle="We will email you a link if the address is registered." />
        {sent ? (
          <Notice kind="success">
            If that address has an account, a reset link is on its way. The link is valid for one hour.
          </Notice>
        ) : (
          <form className="stack" onSubmit={onSubmit}>
            <ErrorNotice error={error} />
            <label className="field">
              <span className="field-label">Email address</span>
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <button className="button" type="submit" disabled={busy}>
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
          </form>
        )}
        <p className="field-hint" style={{ marginTop: 14 }}>
          <Link to="/login">Back to sign in</Link>
        </p>
      </Card>
    </AuthShell>
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
    <AuthShell>
      <Card>
        <CardHeader title="Choose a new password" />
        {!token ? (
          <Notice kind="error">This link is missing its token. Request a new reset email.</Notice>
        ) : done ? (
          <>
            <Notice kind="success">
              Your password has been changed and every existing session was signed out.
            </Notice>
            <p className="field-hint" style={{ marginTop: 14 }}>
              <Link to="/login">Sign in with your new password</Link>
            </p>
          </>
        ) : (
          <form className="stack" onSubmit={onSubmit}>
            <ErrorNotice error={error} />
            <label className="field">
              <span className="field-label">New password</span>
              <input
                type="password"
                autoComplete="new-password"
                required
                minLength={MIN_PASSWORD}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <span className="field-hint">At least {MIN_PASSWORD} characters.</span>
            </label>
            <button className="button" type="submit" disabled={busy || password.length < MIN_PASSWORD}>
              {busy ? 'Saving…' : 'Change password'}
            </button>
          </form>
        )}
      </Card>
    </AuthShell>
  );
}

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const auth = useAuth();
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
        await auth.refresh();
      } catch (err) {
        if (cancelled) return;
        setError(err);
        setState('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
    // auth.refresh is stable enough for this one-shot effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthShell>
      <Card>
        <CardHeader title="Confirm your email address" />
        {state === 'pending' ? <p>Checking your confirmation link…</p> : null}
        {state === 'ok' ? (
          <>
            <Notice kind="success">Your email address is confirmed.</Notice>
            <p className="field-hint" style={{ marginTop: 14 }}>
              <Link to="/">Go to your projects</Link>
            </p>
          </>
        ) : null}
        {state === 'failed' ? (
          <>
            <ErrorNotice error={error} />
            <p className="field-hint" style={{ marginTop: 14 }}>
              Signed in? Open <Link to="/account">your account</Link> to send a fresh link.
            </p>
          </>
        ) : null}
      </Card>
    </AuthShell>
  );
}
