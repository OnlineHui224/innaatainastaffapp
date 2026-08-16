import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { PasswordChangeModal } from '@/components/PasswordChangeModal';
import LandingPage from '@/pages/LandingPage';
import LoginPage from '@/pages/LoginPage';
import AppLayout from '@/pages/app/AppLayout';
import Dashboard from '@/pages/app/Dashboard';
import PilgrimsPage from '@/pages/app/PilgrimsPage';
import PilgrimDetailsPage from '@/pages/app/PilgrimDetailsPage';
import PilgrimFormPage from '@/pages/app/PilgrimFormPage';
import ImportPilgrimsPage from '@/pages/app/ImportPilgrimsPage';
import ImportCsvPage from '@/pages/app/ImportCsvPage';
import ReviewQueuePage from '@/pages/app/ReviewQueuePage';
import SubAgentsPage from '@/pages/app/SubAgentsPage';
import SubAgentDetailsPage from '@/pages/app/SubAgentDetailsPage';
import SubAgentFormPage from '@/pages/app/SubAgentFormPage';
import StaffUsersPage from '@/pages/app/StaffUsersPage';
import AuditHistoryPage from '@/pages/app/AuditHistoryPage';
import VisaLoggerPage from '@/pages/app/VisaLoggerPage';
import FlightDocumentOpsPage from '@/pages/app/FlightDocumentOpsPage';
import HotelImportPage from '@/pages/app/HotelImportPage';
import type { JSX } from 'react';

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-950" role="status">
      <div className="text-center">
        <span
          className="inline-block h-9 w-9 animate-spin rounded-full border-2 border-white/15 border-t-gold-400"
          aria-hidden="true"
        />
        <p className="mt-4 text-sm text-white/60">Loading platform…</p>
      </div>
    </div>
  );
}

function ProtectedRoute({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  return children;
}

function AdminRoute({ children }: { children: JSX.Element }) {
  const { session, profile, loading, canManageStaff } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (!canManageStaff) return <Navigate to="/app/dashboard" replace />;
  void profile;
  return children;
}

/**
 * Gates routes that exist only to write operational records.
 *
 * Viewers have read access to every operational module but must not reach a
 * create/edit/import/review surface by typing its URL. This reuses the existing
 * `canEditPilgrims` permission — no new RBAC model is introduced.
 */
function EditorRoute({ children }: { children: JSX.Element }) {
  const { session, loading, canEditPilgrims } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!session) return <Navigate to="/login" replace />;
  if (!canEditPilgrims) return <Navigate to="/app/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/app"
            element={
              <ProtectedRoute>
                <>
                  <AppLayout />
                  <PasswordChangeModal />
                </>
              </ProtectedRoute>
            }
          >
            <Route index element={<Navigate to="/app/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="pilgrims" element={<PilgrimsPage />} />
            <Route
              path="pilgrims/new"
              element={
                <EditorRoute>
                  <PilgrimFormPage />
                </EditorRoute>
              }
            />
            <Route path="pilgrims/:id" element={<PilgrimDetailsPage />} />
            <Route
              path="pilgrims/:id/edit"
              element={
                <EditorRoute>
                  <PilgrimFormPage />
                </EditorRoute>
              }
            />
            {/* Specialised Verified Import — URL-only, never in sidebar navigation */}
            <Route
              path="pilgrims/import"
              element={
                <EditorRoute>
                  <ImportPilgrimsPage />
                </EditorRoute>
              }
            />
            <Route
              path="pilgrims/import-csv"
              element={
                <EditorRoute>
                  <ImportCsvPage />
                </EditorRoute>
              }
            />
            <Route
              path="pilgrims/review-queue"
              element={
                <EditorRoute>
                  <ReviewQueuePage />
                </EditorRoute>
              }
            />
            <Route path="sub-agents" element={<SubAgentsPage />} />
            <Route
              path="sub-agents/new"
              element={
                <EditorRoute>
                  <SubAgentFormPage />
                </EditorRoute>
              }
            />
            <Route path="sub-agents/:id" element={<SubAgentDetailsPage />} />
            <Route
              path="sub-agents/:id/edit"
              element={
                <EditorRoute>
                  <SubAgentFormPage />
                </EditorRoute>
              }
            />
            <Route path="visa-logger" element={<VisaLoggerPage />} />
            {/* Viewers reach this route and receive a read-only surface from the
                page itself, exactly as the Visa & Contract Logger does. No new
                RBAC tier is introduced. */}
            <Route path="flight-document-ops" element={<FlightDocumentOpsPage />} />
            <Route
              path="hotel-import"
              element={
                <AdminRoute>
                  <HotelImportPage />
                </AdminRoute>
              }
            />
            <Route
              path="staff-users"
              element={
                <AdminRoute>
                  <StaffUsersPage />
                </AdminRoute>
              }
            />
            <Route
              path="audit-history"
              element={
                <AdminRoute>
                  <AuditHistoryPage />
                </AdminRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
