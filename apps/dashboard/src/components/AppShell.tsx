import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { resources } from '../api.ts';
import { useAuth } from '../auth.tsx';
import { ThemeSelector } from './ThemeSelector.tsx';
import { CloseIcon, MenuIcon, OverviewIcon, ProjectsIcon, ReportsIcon } from './icons.tsx';

const NAV = [
  { to: '/dashboard', label: 'Overview', Icon: OverviewIcon, end: true },
  { to: '/projects', label: 'Projects', Icon: ProjectsIcon, end: false },
  { to: '/reports', label: 'All reports', Icon: ReportsIcon, end: false },
] as const;

function NavLinks({ onNavigate, newCount }: { onNavigate?: () => void; newCount: number | null }) {
  return (
    <nav className="nav-group" aria-label="Main">
      {NAV.map(({ to, label, Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          onClick={onNavigate}
        >
          <Icon />
          {label}
          {to === '/reports' && newCount !== null && newCount > 0 ? (
            <span className="count" aria-label={`${newCount} new reports`}>
              {newCount}
            </span>
          ) : null}
        </NavLink>
      ))}
    </nav>
  );
}

function AccountBlock({ onNavigate }: { onNavigate?: () => void }) {
  const { owner, signOut } = useAuth();
  return (
    <div className="sidebar-footer">
      <div className="sidebar-theme">
        <span>Theme</span>
        <ThemeSelector compact />
      </div>
      <div className="sidebar-account">
        <span className="email" title={owner?.email}>
          {owner?.email}
        </span>
      </div>
      <div className="nav-group">
        <NavLink to="/account" className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`} onClick={onNavigate}>
          Account
        </NavLink>
        <button type="button" className="nav-item" onClick={() => void signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Names the current screen in the tab, the history entry and the window list. */
function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = `${title} · BugInbox`;
  }, [title]);
}

export interface PageHeaderProps {
  title: string;
  breadcrumbs?: Array<{ label: string; to?: string }>;
  actions?: ReactNode;
}

/**
 * The persistent shell: sidebar on desktop, drawer on small screens, and a
 * compact bar carrying the page title and its one contextual action.
 */
export function AppShell({ header, children }: { header: PageHeaderProps; children: ReactNode }) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The application is a single document, so without this every dashboard tab
  // and history entry carried the marketing title from index.html.
  useDocumentTitle(header.title);
  const location = useLocation();
  const drawerRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // A cheap, already-cached figure: the badge reuses the projects query.
  const projects = useQuery({ queryKey: ['projects'], queryFn: resources.projects, staleTime: 15_000 });
  const newCount = projects.data
    ? projects.data.projects.reduce((sum, project) => sum + project.newReportCount, 0)
    : null;

  // Route changes close the drawer.
  useEffect(() => setDrawerOpen(false), [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setDrawerOpen(false);
        toggleRef.current?.focus();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;

      const focusable = [...drawerRef.current.querySelectorAll<HTMLElement>('a[href], button')].filter(
        (element) => !element.hasAttribute('disabled'),
      );
      if (focusable.length === 0) return;
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    // Focus moves into the drawer so the keyboard is not left behind it.
    drawerRef.current?.querySelector<HTMLElement>('a[href], button')?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen]);

  return (
    <div className="app">
      <aside className="app-sidebar">
        <Link className="brand" to="/">
          <span className="brand-mark" aria-hidden="true">
            B
          </span>
          BugInbox
        </Link>
        <NavLinks newCount={newCount} />
        <AccountBlock />
      </aside>

      <div className="app-main">
        <a className="skip-link" href="#main">
          Skip to content
        </a>
        <header className="page-bar">
          <button
            type="button"
            ref={toggleRef}
            className="icon-button mobile-only"
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon />
          </button>

          <div className="page-bar-text">
            {header.breadcrumbs && header.breadcrumbs.length > 0 ? (
              <nav className="breadcrumbs" aria-label="Breadcrumb">
                {header.breadcrumbs.map((crumb, index) => (
                  <span key={`${crumb.label}-${index}`}>
                    {crumb.to ? <Link to={crumb.to}>{crumb.label}</Link> : crumb.label}
                    {index < header.breadcrumbs!.length - 1 ? <span aria-hidden="true"> / </span> : null}
                  </span>
                ))}
              </nav>
            ) : null}
            <h1 className="truncate">{header.title}</h1>
          </div>

          {header.actions ? <div className="page-bar-actions">{header.actions}</div> : null}
        </header>

        {/* The one main landmark. Without it every screen reported its content
            as sitting outside any landmark, so "skip to main content" and
            landmark navigation had nothing to jump to. */}
        <main className="app-content" id="main">
          {children}
        </main>
      </div>

      {drawerOpen ? (
        <>
          <div className="drawer-backdrop" onClick={() => setDrawerOpen(false)} />
          <div className="drawer" role="dialog" aria-modal="true" aria-label="Navigation" ref={drawerRef}>
            <div className="toolbar" style={{ marginBottom: 8 }}>
              <Link className="brand" to="/">
                <span className="brand-mark" aria-hidden="true">
                  B
                </span>
                BugInbox
              </Link>
              <span className="spacer" />
              <button type="button" className="icon-button" aria-label="Close navigation" onClick={() => setDrawerOpen(false)}>
                <CloseIcon />
              </button>
            </div>
            <NavLinks newCount={newCount} onNavigate={() => setDrawerOpen(false)} />
            <AccountBlock onNavigate={() => setDrawerOpen(false)} />
          </div>
        </>
      ) : null}
    </div>
  );
}
