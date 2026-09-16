import { NavLink, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.tsx';
import { Loading, Notice } from './components/ui.tsx';
import { ThemeSelector } from './components/ThemeSelector.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from './pages/AuthPages.tsx';
import { NewProjectPage, ProjectsPage } from './pages/ProjectsPage.tsx';
import { ProjectLayout } from './pages/ProjectLayout.tsx';
import { InstallPage } from './pages/InstallPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { ReportDetailPage, ReportsPage } from './pages/ReportsPage.tsx';
import { AccountPage } from './pages/AccountPage.tsx';

function TopBar() {
  const { owner, signOut } = useAuth();
  return (
    <header className="topbar">
      <NavLink className="brand" to="/dashboard">
        <span className="brand-mark" aria-hidden="true">
          B
        </span>
        BugInbox
      </NavLink>
      <nav aria-label="Main">
        <NavLink className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`} to="/dashboard" end>
          Projects
        </NavLink>
        <NavLink className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`} to="/reports">
          All reports
        </NavLink>
      </nav>
      <span className="topbar-spacer" />
      <ThemeSelector compact />
      <NavLink className={({ isActive }) => `navlink ${isActive ? 'active' : ''}`} to="/account">
        {owner?.email}
      </NavLink>
      <button className="button ghost small" type="button" onClick={() => void signOut()}>
        Sign out
      </button>
    </header>
  );
}

function ProtectedLayout() {
  const { owner, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="content">
        <Loading label="Checking your session" rows={3} />
      </div>
    );
  }
  if (!owner) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return (
    <div className="shell">
      <TopBar />
      {!owner.emailVerified ? (
        <div className="content" style={{ paddingBottom: 0 }}>
          <Notice kind="warning">
            Confirm your email address to create projects. Open <a href="/account">your account</a> to send a fresh link.
          </Notice>
        </div>
      ) : null}
      <Outlet />
    </div>
  );
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { owner, loading } = useAuth();
  if (loading) {
    return (
      <div className="content narrow" style={{ paddingTop: 48 }}>
        <Loading label="Checking your session" rows={2} />
      </div>
    );
  }
  return owner ? <Navigate to="/dashboard" replace /> : <>{children}</>;
}

export function App() {
  return (
    <Routes>
      {/* Public marketing site. Reachable whether or not someone is signed in. */}
      <Route path="/" element={<HomePage />} />

      <Route
        path="/login"
        element={
          <GuestOnly>
            <LoginPage />
          </GuestOnly>
        }
      />
      <Route
        path="/signup"
        element={
          <GuestOnly>
            <SignupPage />
          </GuestOnly>
        }
      />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route element={<ProtectedLayout />}>
        {/* The projects list used to live at "/". Every other dashboard path is
            unchanged, so existing links and emailed report links still work. */}
        <Route path="/dashboard" element={<ProjectsPage />} />
        <Route path="/projects" element={<Navigate to="/dashboard" replace />} />
        <Route path="/projects/new" element={<NewProjectPage />} />
        <Route path="/projects/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="reports" replace />} />
          <Route path="reports" element={<ReportsPage scope="project" />} />
          <Route path="install" element={<InstallPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
        <Route path="/projects/:projectId/reports/:reportId" element={<ReportDetailPage />} />
        <Route path="/reports" element={<ReportsPage scope="all" />} />
        <Route path="/reports/:reportId" element={<ReportDetailPage />} />
        <Route path="/account" element={<AccountPage />} />
      </Route>

      {/* Anything unrecognised lands on the public homepage rather than a
          protected route, so signed-out visitors are not bounced to sign-in. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
