import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  LAUNCHER_ICONS,
  LAUNCHER_POSITIONS,
  evaluateEligibility,
  validateRulePattern,
  type LauncherIcon,
  type LauncherPosition,
  type PathRule,
} from '@buginbox/shared';
import { resources, type Project, type ProjectAppearance } from '../api.ts';
import { useProject } from './ProjectLayout.tsx';
import { Card, CardHeader, ErrorNotice, Notice, Segmented } from '../components/ui.tsx';

interface Draft {
  name: string;
  appearance: ProjectAppearance;
  trigger: { mode: 'immediate' | 'delay' | 'manual'; delayMs: number };
  rules: PathRule[];
  collectPageUrl: boolean;
  notifyEmailEnabled: boolean;
  notifyEmail: string;
  retentionDays: number;
}

function toDraft(project: Project): Draft {
  return {
    name: project.name,
    appearance: { ...project.appearance },
    trigger: { ...project.trigger },
    rules: project.rules.map((rule) => ({ ...rule })),
    collectPageUrl: project.collectPageUrl,
    notifyEmailEnabled: project.notifyEmailEnabled,
    notifyEmail: project.notifyEmail ?? '',
    retentionDays: project.retentionDays,
  };
}

const ICON_LABELS: Record<LauncherIcon, string> = {
  bug: 'Bug',
  chat: 'Chat',
  flag: 'Flag',
  help: 'Question',
  megaphone: 'Megaphone',
};

const POSITION_LABELS: Record<LauncherPosition, string> = {
  'bottom-right': 'Bottom right',
  'bottom-left': 'Bottom left',
  'top-right': 'Top right',
  'top-left': 'Top left',
};

function WidgetPreview({ appearance, device }: { appearance: ProjectAppearance; device: 'desktop' | 'mobile' }) {
  const mobile = device === 'mobile';
  const offsetX = mobile ? appearance.mobileOffsetX : appearance.offsetX;
  const offsetY = mobile ? appearance.mobileOffsetY : appearance.offsetY;
  const [vertical, horizontal] = appearance.position.split('-') as ['top' | 'bottom', 'left' | 'right'];

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = appearance.theme === 'dark' || (appearance.theme === 'system' && prefersDark);

  const hidden = mobile && !appearance.mobileEnabled;

  const anchor: React.CSSProperties = { [vertical]: offsetY, [horizontal]: offsetX };
  const panelAnchor: React.CSSProperties = {
    [vertical]: offsetY + 58,
    [horizontal]: offsetX,
  };

  return (
    <div className={`preview-stage ${mobile ? 'mobile' : ''}`}>
      {hidden ? (
        <p className="field-hint" style={{ padding: 16 }}>
          Mobile visibility is turned off, so nothing appears on small screens.
        </p>
      ) : (
        <>
          <div className={`preview-panel ${dark ? 'dark' : 'light'}`} style={panelAnchor}>
            <strong>Report a problem</strong>
            <div className="fake-input" style={{ height: 44 }} />
            <div className="fake-input" />
            <div className="fake-button" style={{ background: appearance.accentColor }}>
              Send report
            </div>
          </div>
          {appearance.launcherEnabled ? (
            <div className="preview-launcher" style={{ ...anchor, background: appearance.accentColor }}>
              <span aria-hidden="true">●</span>
              <span>{appearance.launcherText || 'Report a problem'}</span>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function RuleTester({ rules, mobileEnabled, status }: { rules: PathRule[]; mobileEnabled: boolean; status: 'active' | 'paused' }) {
  const [url, setUrl] = useState('https://example.com/checkout/payment?step=2');
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');

  const verdict = useMemo(
    () => evaluateEligibility({ projectStatus: status, mobileEnabled, device, path: url, rules }),
    [url, device, rules, mobileEnabled, status],
  );

  return (
    <div className="stack">
      <label className="field">
        <span className="field-label">Sample page URL or path</span>
        <input type="text" value={url} onChange={(e) => setUrl(e.target.value)} />
        <span className="field-hint">
          Query strings and fragments are ignored, and a trailing slash makes no difference.
        </span>
      </label>
      <Segmented
        label="Device"
        value={device}
        onChange={setDevice}
        options={[
          { value: 'desktop', label: 'Desktop' },
          { value: 'mobile', label: 'Mobile' },
        ]}
      />
      <Notice kind={verdict.eligible ? 'success' : 'warning'}>
        <strong>{verdict.eligible ? 'The widget would appear.' : 'The widget would not appear.'}</strong>{' '}
        {verdict.reason}
      </Notice>
      {verdict.ignoredRules.length > 0 ? (
        <Notice kind="error">
          {verdict.ignoredRules.length} rule{verdict.ignoredRules.length === 1 ? ' is' : 's are'} invalid and ignored:{' '}
          {verdict.ignoredRules.map((rule) => rule.pattern).join(', ')}
        </Notice>
      ) : null}
    </div>
  );
}

function RuleEditor({
  kind,
  rules,
  onChange,
}: {
  kind: 'include' | 'exclude';
  rules: PathRule[];
  onChange: (rules: PathRule[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const mine = rules.filter((rule) => rule.kind === kind);
  const validation = draft.trim() === '' ? null : validateRulePattern(draft.trim());

  function add() {
    const pattern = draft.trim();
    if (pattern === '' || !validateRulePattern(pattern).valid) return;
    if (mine.some((rule) => rule.pattern === pattern)) return;
    onChange([...rules, { kind, pattern }]);
    setDraft('');
  }

  return (
    <div className="stack">
      {mine.length === 0 ? (
        <p className="field-hint">
          {kind === 'include'
            ? 'No include rules, so every path is included.'
            : 'No exclude rules.'}
        </p>
      ) : (
        <ul className="tag-list" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {mine.map((rule) => (
            <li className="tag" key={rule.pattern}>
              <span className="mono">{rule.pattern}</span>
              <button
                type="button"
                aria-label={`Remove ${kind} rule ${rule.pattern}`}
                onClick={() => onChange(rules.filter((r) => !(r.kind === kind && r.pattern === rule.pattern)))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="inline-form">
        <label className="field">
          <span className="visually-hidden">Add an {kind} rule</span>
          <input
            type="text"
            value={draft}
            placeholder={kind === 'include' ? '/pricing' : '/checkout/*'}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                add();
              }
            }}
          />
        </label>
        <button className="button secondary" type="button" onClick={add} disabled={!validation?.valid}>
          Add
        </button>
      </div>
      {validation && !validation.valid ? <p className="notice error">{validation.reason}</p> : null}
    </div>
  );
}

export function SettingsPage() {
  const project = useProject();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState<Draft>(() => toDraft(project));
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [saved, setSaved] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    setDraft(toDraft(project));
  }, [project]);

  const invalidate = async () => {
    await client.invalidateQueries({ queryKey: ['project', project.id] });
    await client.invalidateQueries({ queryKey: ['projects'] });
  };

  const save = useMutation({
    mutationFn: () =>
      resources.updateProject(project.id, {
        name: draft.name.trim(),
        appearance: draft.appearance,
        trigger: draft.trigger,
        rules: draft.rules,
        collectPageUrl: draft.collectPageUrl,
        notifyEmailEnabled: draft.notifyEmailEnabled,
        notifyEmail: draft.notifyEmail.trim() === '' ? null : draft.notifyEmail.trim(),
        retentionDays: draft.retentionDays,
      }),
    onSuccess: async () => {
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
      await invalidate();
    },
  });

  const toggleStatus = useMutation({
    mutationFn: () => resources.updateProject(project.id, { status: project.status === 'active' ? 'paused' : 'active' }),
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: () => resources.deleteProject(project.id, confirmName),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['projects'] });
      navigate('/', { replace: true });
    },
  });

  const setAppearance = (patch: Partial<ProjectAppearance>) =>
    setDraft((current) => ({ ...current, appearance: { ...current.appearance, ...patch } }));

  return (
    <div className="stack">
      <Card>
        <CardHeader title="Project" />
        <label className="field">
          <span className="field-label">Name</span>
          <input
            type="text"
            maxLength={80}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
      </Card>

      <Card>
        <CardHeader title="Appearance" subtitle="How the launcher and form look on your website." />
        <div className="grid two">
          <div className="stack">
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.appearance.launcherEnabled}
                onChange={(e) => setAppearance({ launcherEnabled: e.target.checked })}
              />
              <span>
                <span className="field-label">Show the floating launcher</span>
                <span className="field-hint">
                  Turn this off to open the form only from your own button, using <code>BugInbox.open()</code>.
                </span>
              </span>
            </label>

            <label className="field">
              <span className="field-label">Launcher text</span>
              <input
                type="text"
                maxLength={40}
                value={draft.appearance.launcherText}
                onChange={(e) => setAppearance({ launcherText: e.target.value })}
              />
            </label>

            <label className="field">
              <span className="field-label">Accent colour</span>
              <span className="row">
                <input
                  type="color"
                  value={draft.appearance.accentColor}
                  onChange={(e) => setAppearance({ accentColor: e.target.value })}
                  aria-label="Accent colour"
                />
                <input
                  type="text"
                  value={draft.appearance.accentColor}
                  onChange={(e) => setAppearance({ accentColor: e.target.value })}
                  style={{ maxWidth: 140 }}
                  aria-label="Accent colour hex value"
                />
              </span>
            </label>

            <fieldset>
              <legend>Appearance mode</legend>
              <Segmented
                label="Appearance mode"
                value={draft.appearance.theme}
                onChange={(theme) => setAppearance({ theme })}
                options={[
                  { value: 'light', label: 'Light' },
                  { value: 'dark', label: 'Dark' },
                  { value: 'system', label: 'System' },
                ]}
              />
            </fieldset>

            <fieldset>
              <legend>Icon</legend>
              <Segmented
                label="Launcher icon"
                value={draft.appearance.icon}
                onChange={(icon) => setAppearance({ icon })}
                options={LAUNCHER_ICONS.map((icon) => ({ value: icon, label: ICON_LABELS[icon] }))}
              />
            </fieldset>

            <fieldset>
              <legend>Corner</legend>
              <Segmented
                label="Launcher corner"
                value={draft.appearance.position}
                onChange={(position) => setAppearance({ position })}
                options={LAUNCHER_POSITIONS.map((position) => ({ value: position, label: POSITION_LABELS[position] }))}
              />
            </fieldset>
          </div>

          <div className="stack">
            <Segmented
              label="Preview device"
              value={device}
              onChange={setDevice}
              options={[
                { value: 'desktop', label: 'Desktop preview' },
                { value: 'mobile', label: 'Mobile preview' },
              ]}
            />
            <WidgetPreview appearance={draft.appearance} device={device} />

            <label className="field">
              <span className="field-label">Horizontal offset: {draft.appearance.offsetX} px</span>
              <input
                type="range"
                min={0}
                max={200}
                value={draft.appearance.offsetX}
                onChange={(e) => setAppearance({ offsetX: Number(e.target.value) })}
              />
            </label>
            <label className="field">
              <span className="field-label">Vertical offset: {draft.appearance.offsetY} px</span>
              <input
                type="range"
                min={0}
                max={200}
                value={draft.appearance.offsetY}
                onChange={(e) => setAppearance({ offsetY: Number(e.target.value) })}
              />
            </label>

            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.appearance.mobileEnabled}
                onChange={(e) => setAppearance({ mobileEnabled: e.target.checked })}
              />
              <span>
                <span className="field-label">Show on mobile</span>
                <span className="field-hint">Mobile means a viewport of 767 px or narrower.</span>
              </span>
            </label>

            {draft.appearance.mobileEnabled ? (
              <>
                <label className="field">
                  <span className="field-label">Mobile horizontal offset: {draft.appearance.mobileOffsetX} px</span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={draft.appearance.mobileOffsetX}
                    onChange={(e) => setAppearance({ mobileOffsetX: Number(e.target.value) })}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Mobile vertical offset: {draft.appearance.mobileOffsetY} px</span>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    value={draft.appearance.mobileOffsetY}
                    onChange={(e) => setAppearance({ mobileOffsetY: Number(e.target.value) })}
                  />
                </label>
              </>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="When the launcher appears" />
        <div className="stack">
          <Segmented
            label="Trigger mode"
            value={draft.trigger.mode}
            onChange={(mode) => setDraft({ ...draft, trigger: { ...draft.trigger, mode } })}
            options={[
              { value: 'immediate', label: 'Immediately' },
              { value: 'delay', label: 'After a delay' },
              { value: 'manual', label: 'Manual only' },
            ]}
          />
          {draft.trigger.mode === 'delay' ? (
            <label className="field">
              <span className="field-label">Delay: {(draft.trigger.delayMs / 1000).toFixed(1)} s</span>
              <input
                type="range"
                min={500}
                max={60000}
                step={500}
                value={draft.trigger.delayMs || 3000}
                onChange={(e) => setDraft({ ...draft, trigger: { ...draft.trigger, delayMs: Number(e.target.value) } })}
              />
            </label>
          ) : null}
          <p className="field-hint">
            {draft.trigger.mode === 'immediate'
              ? 'The launcher is rendered as soon as the widget is ready.'
              : draft.trigger.mode === 'delay'
                ? 'The launcher appears after the delay. Calling BugInbox.open() from your own code bypasses the delay.'
                : 'Nothing appears on its own. Call BugInbox.show() to reveal the launcher, or BugInbox.open() to open the form.'}
          </p>
        </div>
      </Card>

      <Card>
        <CardHeader
          title="Which pages"
          subtitle="Eligible = project active, device allowed, an include rule satisfied, and no exclude rule matched."
        />
        <div className="grid two">
          <div className="stack">
            <h3>Include</h3>
            <RuleEditor kind="include" rules={draft.rules} onChange={(rules) => setDraft({ ...draft, rules })} />
            <h3 style={{ marginTop: 10 }}>Exclude</h3>
            <RuleEditor kind="exclude" rules={draft.rules} onChange={(rules) => setDraft({ ...draft, rules })} />
            <div className="notice info">
              <strong>Rule grammar.</strong> <code>/checkout</code> matches only that page.{' '}
              <code>/checkout/*</code> matches <code>/checkout</code> and everything beneath it, but never
              <code> /checkoutfoo</code>. <code>/*</code> matches everything. An exclude rule always wins. Fragments are
              never inspected, so hash-router routes cannot be matched — use manual mode and your own code instead.
            </div>
          </div>
          <div className="stack">
            <h3>Test a page</h3>
            <RuleTester rules={draft.rules} mobileEnabled={draft.appearance.mobileEnabled} status={project.status} />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Data and notifications" />
        <div className="stack">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.collectPageUrl}
              onChange={(e) => setDraft({ ...draft, collectPageUrl: e.target.checked })}
            />
            <span>
              <span className="field-label">Collect the page address</span>
              <span className="field-hint">
                Query strings and fragments are always stripped. Paths can still contain sensitive values, so turn this
                off and send your own page context if that is a concern for your site.
              </span>
            </span>
          </label>

          <label className="checkbox">
            <input
              type="checkbox"
              checked={draft.notifyEmailEnabled}
              onChange={(e) => setDraft({ ...draft, notifyEmailEnabled: e.target.checked })}
            />
            <span>
              <span className="field-label">Email me when a report arrives</span>
              <span className="field-hint">Applies to reports received after you save this setting.</span>
            </span>
          </label>

          {draft.notifyEmailEnabled ? (
            <label className="field">
              <span className="field-label">Send notifications to</span>
              <input
                type="email"
                value={draft.notifyEmail}
                placeholder="Leave blank to use your account email"
                onChange={(e) => setDraft({ ...draft, notifyEmail: e.target.value })}
              />
            </label>
          ) : null}

          <label className="field">
            <span className="field-label">Keep reports for {draft.retentionDays} days</span>
            <input
              type="range"
              min={7}
              max={365}
              step={1}
              value={draft.retentionDays}
              onChange={(e) => setDraft({ ...draft, retentionDays: Number(e.target.value) })}
            />
            <span className="field-hint">
              Reports and their screenshots are deleted automatically once they are this old. Changing this affects
              reports received from now on.
            </span>
          </label>
        </div>
      </Card>

      <Card>
        <div className="spread">
          <div className="row">
            <button className="button" type="button" onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? 'Saving…' : 'Save settings'}
            </button>
            <button className="button ghost" type="button" onClick={() => setDraft(toDraft(project))} disabled={save.isPending}>
              Discard changes
            </button>
          </div>
          {saved ? <span className="badge resolved">Saved</span> : null}
        </div>
        <ErrorNotice error={save.error} />
      </Card>

      <Card>
        <CardHeader
          title={project.status === 'active' ? 'Pause this project' : 'Resume this project'}
          subtitle={
            project.status === 'active'
              ? 'Pausing hides the widget and makes the server reject new reports, even from browsers holding cached configuration. Existing reports are kept.'
              : 'Resuming lets the widget appear again and the server accept new reports.'
          }
        />
        <button className="button secondary" type="button" onClick={() => toggleStatus.mutate()} disabled={toggleStatus.isPending}>
          {project.status === 'active' ? 'Pause project' : 'Resume project'}
        </button>
        <ErrorNotice error={toggleStatus.error} />
      </Card>

      <Card className="danger-zone">
        <CardHeader
          title="Delete this project"
          subtitle="Deletes the project, its settings, every report and every stored screenshot. This cannot be undone."
        />
        {showDelete ? (
          <div className="stack">
            <label className="field">
              <span className="field-label">
                Type <strong>{project.name}</strong> to confirm
              </span>
              <input type="text" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
            </label>
            <ErrorNotice error={remove.error} />
            <div className="row">
              <button
                className="button danger"
                type="button"
                disabled={confirmName !== project.name || remove.isPending}
                onClick={() => remove.mutate()}
              >
                {remove.isPending ? 'Deleting…' : `Delete ${project.usage.reportCount} report(s) and this project`}
              </button>
              <button className="button ghost" type="button" onClick={() => setShowDelete(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button className="button danger" type="button" onClick={() => setShowDelete(true)}>
            Delete project…
          </button>
        )}
      </Card>
    </div>
  );
}
