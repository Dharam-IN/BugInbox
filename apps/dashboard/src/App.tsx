import { Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.tsx';
import { Loading } from './components/ui.tsx';
import { HomePage } from './pages/HomePage.tsx';
import { ForgotPasswordPage, LoginPage, ResetPasswordPage, SignupPage, VerifyEmailPage } from './pages/AuthPages.tsx';
import { OverviewPage } from './pages/OverviewPage.tsx';
import { ProjectsPage } from './pages/ProjectsPage.tsx';
import { NewProjectPage } from './pages/NewProjectPage.tsx';
import { ProjectProvider } from './pages/ProjectLayout.tsx';
import { InstallPage } from './pages/InstallPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { ReportsPage } from './pages/ReportsPage.tsx';
import { ReportDetailPage } from './pages/ReportDetailPage.tsx';
import { AccountPage } from './pages/AccountPage.tsx';

function ProtectedLayout() {
  const { owner, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="page-body">
        <Loading label="Checking your session" rows={3} />
      </div>
    );
  }
  if (!owner) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  return <Outlet />;
}

function GuestOnly({ children }: { children: React.ReactNode }) {
  const { owner, loading } = useAuth();
  if (loading) {
    return (
      <div className="page-body narrow" style={{ paddingTop: 48 }}>
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
        {/* /dashboard is the overview; the projects list has its own route. */}
        <Route path="/dashboard" element={<OverviewPage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/new" element={<NewProjectPage />} />

        <Route path="/projects/:projectId" element={<ProjectProvider />}>
          <Route index element={<Navigate to="reports" replace />} />
          <Route path="reports" element={<ReportsPage scope="project" />} />
          <Route path="install" element={<InstallPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>

        {/* Report detail is not nested under the project provider, so it can be
            opened straight from the global inbox without loading the project. */}
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
