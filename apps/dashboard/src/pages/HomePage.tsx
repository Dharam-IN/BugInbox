import { useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../auth.tsx';
import { ThemeSelector } from '../components/ThemeSelector.tsx';
import { ProductPreview } from '../components/ProductPreview.tsx';

/** Simple line icons, drawn inline so the page needs no icon font or CDN. */
function FeatureIcon({ paths }: { paths: string[] }) {
  return (
    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

const ICONS = {
  appearance: ['M3 5.5A2.5 2.5 0 0 1 5.5 3h13A2.5 2.5 0 0 1 21 5.5v13a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 18.5Z', 'M9 3v18'],
  button: ['M7 4h10a3 3 0 0 1 3 3v4a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3Z', 'M9.5 18.5h5', 'M12 14v4.5'],
  message: ['M4 5.5A1.5 1.5 0 0 1 5.5 4h13A1.5 1.5 0 0 1 20 5.5v9a1.5 1.5 0 0 1-1.5 1.5H9l-4 3.5Z', 'M8 9h8', 'M8 12h5'],
  image: ['M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z', 'M4 15.5l4.5-4 4 3.5 3-2.5L20 17', 'M9 9.2h.01'],
  context: ['M12 21s7-5.4 7-11a7 7 0 1 0-14 0c0 5.6 7 11 7 11Z', 'M12 12.2h.01'],
  bell: ['M18 8.5a6 6 0 1 0-12 0c0 5-2 6.5-2 6.5h16s-2-1.5-2-6.5Z', 'M10.3 19a2 2 0 0 0 3.4 0'],
} as const;

const PAGE_TITLE = 'BugInbox — collect website bug reports with the context you need';
const PAGE_DESCRIPTION =
  'BugInbox is a self-hosted website feedback tool. Add one script tag, let visitors report a problem without an account, and review every report with its page, browser context and optional screenshot in your dashboard.';

/**
 * Sets the document title and description for this page, and restores them on
 * unmount so the dashboard keeps its own title. There is no server rendering
 * here, so crawlers that do not execute JavaScript will only see the defaults
 * in index.html; that is documented rather than worked around.
 */
function usePageMeta(title: string, description: string): void {
  useEffect(() => {
    const previousTitle = document.title;
    const meta = document.querySelector('meta[name="description"]');
    const previousDescription = meta?.getAttribute('content') ?? '';

    document.title = title;
    meta?.setAttribute('content', description);

    return () => {
      document.title = previousTitle;
      meta?.setAttribute('content', previousDescription);
    };
  }, [title, description]);
}

const SECTIONS = [
  { href: '#how-it-works', label: 'How it works' },
  { href: '#features', label: 'Features' },
  { href: '#faq', label: 'FAQ' },
];

function SiteNav() {
  const { owner, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const panelId = useId();

  // Escape closes the mobile menu, matching the rest of the interface.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  const actions = owner ? (
    <Link className="button" to="/dashboard">
      Open dashboard
    </Link>
  ) : (
    <>
      <Link className="site-link" to="/login">
        Sign in
      </Link>
      <Link className="button" to="/signup">
        Get started
      </Link>
    </>
  );

  return (
    <header className="site-nav">
      <div className="site-nav-inner">
        <Link className="brand" to="/" onClick={() => setOpen(false)}>
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          BugInbox
        </Link>

        <nav className="site-nav-links" aria-label="Sections">
          {SECTIONS.map((section) => (
            <a key={section.href} className="site-link" href={section.href}>
              {section.label}
            </a>
          ))}
        </nav>

        <div className="site-nav-actions">
          <span className="desktop-only">
            <ThemeSelector compact />
          </span>
          <span className="desktop-only" style={{ display: 'inline-flex', gap: 10, alignItems: 'center' }}>
            {loading ? null : actions}
          </span>
        </div>

        <button
          type="button"
          className="button secondary small nav-toggle"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((value) => !value)}
        >
          {open ? 'Close' : 'Menu'}
        </button>
      </div>

      {open ? (
        <div className="nav-panel" id={panelId}>
          {SECTIONS.map((section) => (
            <a key={section.href} className="site-link" href={section.href} onClick={() => setOpen(false)}>
              {section.label}
            </a>
          ))}
          <div className="nav-panel-theme">
            <span>Theme</span>
            <ThemeSelector compact />
          </div>
          <div className="nav-panel-actions" onClick={() => setOpen(false)}>
            {loading ? null : actions}
          </div>
        </div>
      ) : null}
    </header>
  );
}

function HeroActions() {
  const { owner, loading } = useAuth();
  if (loading) return null;
  if (owner) {
    return (
      <div className="cta-row">
        <Link className="button large" to="/dashboard">
          Open dashboard
        </Link>
        <Link className="button secondary large" to="/reports">
          See your reports
        </Link>
      </div>
    );
  }
  return (
    <div className="cta-row">
      <Link className="button large" to="/signup">
        Get started
      </Link>
      <Link className="button secondary large" to="/login">
        Sign in
      </Link>
    </div>
  );
}

export function HomePage() {
  usePageMeta(PAGE_TITLE, PAGE_DESCRIPTION);

  return (
    <div className="site">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <SiteNav />

      <main className="site-main" id="main">
        <section className="hero">
          <div className="hero-inner">
            <p className="eyebrow">Self-hosted · early release</p>
            <h1>Collect website bug reports with the context you need.</h1>
            <p className="hero-lead">
              Add one small script to your website. A visitor, client or tester describes what went wrong — no BugInbox
              account needed — and the report arrives in your dashboard with the page address, their browser details and
              a screenshot if they chose to attach one.
            </p>
            <HeroActions />
            <p className="hero-note">
              BugInbox is an early project you run yourself with Docker Compose. There is no hosted service, no pricing
              and no sign-up queue — you create an account on your own installation.
            </p>
          </div>
        </section>

        <ProductPreview />

        <section className="section" id="how-it-works">
          <div className="section-head">
            <h2>How it works</h2>
            <p className="section-lead">Three steps, and the middle one is a copy and paste.</p>
          </div>

          <div className="steps">
            <article className="step">
              <span className="step-number" aria-hidden="true">
                1
              </span>
              <h3>Create a project</h3>
              <p>
                One project per website. You get a public project key and you list the exact origins allowed to send
                reports, so nobody else can post to your inbox.
              </p>
            </article>

            <article className="step">
              <span className="step-number" aria-hidden="true">
                2
              </span>
              <h3>Install the snippet</h3>
              <p>
                Paste one <code>&lt;script&gt;</code> tag carrying your key before <code>&lt;/body&gt;</code>. The
                install page gives you the exact line, plus examples for opening the form from a button you already have
                and for single-page apps.
              </p>
            </article>

            <article className="step">
              <span className="step-number" aria-hidden="true">
                3
              </span>
              <h3>Receive and manage reports</h3>
              <p>
                Get an email when a report arrives, then work through the inbox: read the message and context, open the
                screenshot, and move it from New to In progress to Resolved.
              </p>
            </article>
          </div>
        </section>

        <section className="section" id="who">
          <div className="section-head">
            <h2>Who it helps</h2>
            <p className="section-lead">
              Built for the person who is both the developer and the support inbox.
            </p>
          </div>

          <div className="audience-grid">
            <article className="audience">
              <h3>Solo developers</h3>
              <p>
                Keep several of your own sites in one place, each with its own widget settings and its own inbox, without
                wiring up a support desk.
              </p>
            </article>
            <article className="audience">
              <h3>Freelancers</h3>
              <p>
                Give a client a simple way to tell you what is wrong, with the page and browser attached, instead of a
                message that says “the site is broken”.
              </p>
            </article>
            <article className="audience">
              <h3>Small website teams</h3>
              <p>
                Let testers and colleagues file a problem from the page they are looking at, and triage it together in
                one list.
              </p>
            </article>
          </div>
        </section>

        <section className="section" id="features">
          <div className="section-head">
            <h2>What it actually does</h2>
            <p className="section-lead">
              Everything listed here is implemented today. Nothing on this page describes a feature that does not exist.
            </p>
          </div>

          <div className="feature-grid">
            <article className="feature">
              <span className="feature-icon">
                <FeatureIcon paths={[...ICONS.appearance]} />
              </span>
              <h3>Configurable widget appearance</h3>
              <p>
                Launcher on or off, its text, one accent colour, light, dark or system appearance, one of five preset
                icons, any of four corners, and bounded horizontal and vertical offsets.
              </p>
            </article>

            <article className="feature">
              <span className="feature-icon">
                <FeatureIcon paths={[...ICONS.button]} />
              </span>
              <h3>Open it from your own button</h3>
              <p>
                Turn the floating launcher off and call <code className="inline-code">BugInbox.open()</code> from a
                button you already have. <code className="inline-code">show</code>,{' '}
                <code className="inline-code">hide</code>, <code className="inline-code">close</code> and{' '}
                <code className="inline-code">destroy</code> are available too.
              </p>
            </article>

            <article className="feature">
              <span className="feature-icon">
                <FeatureIcon paths={[...ICONS.message]} />
              </span>
              <h3>The reporter’s own words</h3>
              <p>
                A required description between 5 and 2000 characters, and an email address only if they want to give
                one. No account, no sign-in, no identification.
              </p>
            </article>

            <article className="feature">
              <span className="feature-icon">
                <FeatureIcon paths={[...ICONS.image]} />
              </span>
              <h3>Optional screenshot, attached by hand</h3>
              <p>
                The reporter can pick one PNG or JPEG up to 5 MiB, preview it and remove it before sending. BugInbox
                never captures a screenshot by itself.
              </p>
            </article>

            <article className="feature">
              <span className="feature-icon">
                <FeatureIcon paths={[...ICONS.context]} />
              </span>
              <h3>Page and browser context</h3>
              <p>
                The page address with its query string and fragment stripped, plus viewport size, language, time zone
                and user agent. You can switch URL collection off, or send your own short page label instead.
              </p>
            </article>

            <article className="feature">
              <span className="feature-icon">
                <FeatureIcon paths={[...ICONS.bell]} />
              </span>
              <h3>Statuses and email notifications</h3>
              <p>
                Move each report through New, In progress and Resolved, and choose per project whether an email is sent
                when one arrives — and to which address.
              </p>
            </article>
          </div>
        </section>

        <section className="section" id="control">
          <div className="section-head">
            <h2>You decide where it appears</h2>
            <p className="section-lead">
              The widget is not a thing you install and then hope about. Every part of when, where and how it shows up
              is a setting, and there is a tester in the dashboard that tells you whether a given page qualifies and
              why.
            </p>
          </div>

          <div className="control-grid">
            <dl className="control-list">
              <div>
                <dt>Which pages</dt>
                <dd>
                  Include and exclude rules using an exact path such as <code className="inline-code">/checkout</code>,
                  or a section with a trailing wildcard such as <code className="inline-code">/checkout/*</code>. An
                  exclude rule always wins, and no include rules means every page.
                </dd>
              </div>
              <div>
                <dt>Which devices</dt>
                <dd>
                  A separate mobile visibility switch, with its own offsets. Mobile means a viewport 767 pixels wide or
                  narrower.
                </dd>
              </div>
              <div>
                <dt>When it shows up</dt>
                <dd>
                  Immediately, after a delay you choose, or manual only — nothing appears until your own code asks for
                  it.
                </dd>
              </div>
            </dl>

            <dl className="control-list">
              <div>
                <dt>How it looks</dt>
                <dd>
                  Accent colour, launcher text, preset icon, corner, offsets and light, dark or system appearance, with
                  a live preview beside the settings.
                </dd>
              </div>
              <div>
                <dt>Pausing a project</dt>
                <dd>
                  Pausing hides the widget and makes the server refuse new reports, even from a browser still holding
                  configuration it cached while the project was active. Existing reports are kept.
                </dd>
              </div>
              <div>
                <dt>Single-page apps</dt>
                <dd>
                  The widget re-checks your rules when the route changes, without re-initialising itself or interfering
                  with your router.
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="section" id="faq">
          <div className="section-head">
            <h2>Questions</h2>
          </div>

          <div className="faq-list">
            <details className="faq-item">
              <summary>How do I install it?</summary>
              <div className="faq-answer">
                <p>
                  One script tag before <code className="inline-code">&lt;/body&gt;</code>, carrying your project key.
                  The install page in the dashboard shows the exact line to copy, an example for opening the form from
                  an existing button, a single-page-app example, and the Content Security Policy directives to add if
                  your site sends one.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>Do the people reporting a bug need an account?</summary>
              <div className="faq-answer">
                <p>
                  No. They never sign in and BugInbox does not identify them. The only way it learns who they are is if
                  they choose to type an email address so you can reply.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>Are screenshots taken automatically?</summary>
              <div className="faq-answer">
                <p>
                  No. The reporter chooses a PNG or JPEG themselves, sees a preview and can remove it before sending.
                  There is no automatic capture, no page or DOM capture, no console or network recording and no session
                  replay.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>Does it work with React and other single-page apps?</summary>
              <div className="faq-answer">
                <p>
                  Yes. Initialise it once; it re-checks your page rules on route changes without re-initialising and
                  without disturbing your router. It also works on ordinary multi-page sites with no framework at all.
                </p>
                <p>
                  One limitation worth knowing: hash-router routes cannot be matched by path rules, because BugInbox
                  never reads the fragment of a URL. For those apps, use manual trigger mode and control the widget from
                  your own code.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>What information does it collect?</summary>
              <div className="faq-answer">
                <p>
                  What the reporter typed; an email address if they gave one; the page address with its query string and
                  fragment removed; viewport size, device pixel ratio, language, time zone and user agent; and the image
                  they attached, if any.
                </p>
                <p>
                  It does not read cookies or tokens, form or input values, page HTML, console logs, network bodies,
                  browsing history, or who is signed in to your application.
                </p>
                <p>
                  Stripping the query string reduces exposure but is not a guarantee: a path can still contain something
                  sensitive, which is why URL collection can be switched off entirely or replaced with a short label you
                  supply.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>Can I run it myself?</summary>
              <div className="faq-answer">
                <p>
                  That is currently the only way to run it. The repository ships a Docker Compose setup with Postgres,
                  Redis, a local mail catcher and the application, and the README covers installing, seeding demo data,
                  running the tests, backing up and restoring.
                </p>
              </div>
            </details>

            <details className="faq-item">
              <summary>What happens to reports over time?</summary>
              <div className="faq-answer">
                <p>
                  Reports and their screenshots are deleted 90 days after they arrive by default. The window is
                  configurable per project, each report shows its own deletion date, and you can delete any report — or
                  an entire project and everything in it — whenever you like.
                </p>
              </div>
            </details>
          </div>
        </section>

        <section className="final-cta">
          <div className="final-cta-inner">
            <h2>Put it on your own site</h2>
            <p>
              Create an account on your installation, add a project, and copy the snippet. The whole setup is a script
              tag and one list of allowed origins.
            </p>
            <HeroActions />
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div className="site-footer-inner">
          <span>BugInbox — self-hosted website feedback and bug reporting.</span>
          <nav className="site-footer-links" aria-label="Footer">
            <a className="site-link" href="#how-it-works">
              How it works
            </a>
            <a className="site-link" href="#features">
              Features
            </a>
            <a className="site-link" href="#faq">
              FAQ
            </a>
            <Link className="site-link" to="/login">
              Sign in
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
