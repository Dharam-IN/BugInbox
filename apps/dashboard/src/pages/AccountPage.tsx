import { useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import { resources } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { Card, CardHeader, ErrorNotice, Notice } from '../components/ui.tsx';

const MIN_PASSWORD = 12;

export function AccountPage() {
  const { owner, refresh, signOut } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changed, setChanged] = useState(false);

  const resend = useMutation({
    mutationFn: () => resources.resendVerification(),
  });

  const change = useMutation({
    mutationFn: () => resources.changePassword(currentPassword, newPassword),
    onSuccess: async () => {
      setCurrentPassword('');
      setNewPassword('');
      setChanged(true);
      await refresh();
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    change.mutate();
  }

  return (
    <div className="content narrow">
      <header className="page-header">
        <div>
          <h1>Your account</h1>
          <p className="subtitle">{owner?.email}</p>
        </div>
      </header>

      <Card>
        <CardHeader title="Email address" />
        {owner?.emailVerified ? (
          <Notice kind="success">Your email address is confirmed.</Notice>
        ) : (
          <div className="stack">
            <Notice kind="warning">
              Your email address is not confirmed yet. Projects cannot be created until it is.
            </Notice>
            <ErrorNotice error={resend.error} />
            {resend.isSuccess ? <Notice kind="info">A fresh confirmation link is on its way.</Notice> : null}
            <div>
              <button className="button secondary" type="button" onClick={() => resend.mutate()} disabled={resend.isPending}>
                {resend.isPending ? 'Sending…' : 'Send a new confirmation link'}
              </button>
            </div>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Change password" subtitle="Changing your password signs out every other session." />
        <form className="stack" onSubmit={onSubmit}>
          <ErrorNotice error={change.error} />
          {changed ? <Notice kind="success">Your password has been changed.</Notice> : null}
          <label className="field">
            <span className="field-label">Current password</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
            />
          </label>
          <label className="field">
            <span className="field-label">New password</span>
            <input
              type="password"
              autoComplete="new-password"
              required
              minLength={MIN_PASSWORD}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
            <span className="field-hint">At least {MIN_PASSWORD} characters.</span>
          </label>
          <button className="button" type="submit" disabled={change.isPending || newPassword.length < MIN_PASSWORD}>
            {change.isPending ? 'Saving…' : 'Change password'}
          </button>
        </form>
      </Card>

      <Card>
        <CardHeader title="Sign out" />
        <button className="button secondary" type="button" onClick={() => void signOut()}>
          Sign out of this browser
        </button>
      </Card>
    </div>
  );
}
