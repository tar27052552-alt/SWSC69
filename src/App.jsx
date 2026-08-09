import { useEffect, useRef } from 'react';
import React, { Suspense, lazy } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import PageTracker from './components/PageTracker';
import { ErrorBoundary } from './components/ErrorBoundary';

// Lazy load pages for code-splitting (improves initial load performance)
const LoginPage = lazy(() => import('./pages/LoginPage'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const SchedulesPage = lazy(() => import('./pages/SchedulesPage'));
const CalendarPage = lazy(() => import('./pages/CalendarPage'));
const MyStats = lazy(() => import('./pages/MyStats'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CheckInPage = lazy(() => import('./pages/CheckInPage'));
const CleanDutyPage = lazy(() => import('./pages/CleanDutyPage'));
const GreetingDutyPage = lazy(() => import('./pages/GreetingDutyPage'));
const MyAttendancePage = lazy(() => import('./pages/MyAttendancePage'));
const AdminPage = lazy(() => import('./pages/AdminPage'));
const DisciplinePage = lazy(() => import('./pages/DisciplinePage'));
const MyFinesPage = lazy(() => import('./pages/MyFinesPage'));
const FinancePage = lazy(() => import('./pages/FinancePage'));
const PRPage = lazy(() => import('./pages/PRPage'));
const AnnouncementsPage = lazy(() => import('./pages/AnnouncementsPage'));
const AVPage = lazy(() => import('./pages/AVPage'));
const SecretaryPage = lazy(() => import('./pages/SecretaryPage'));
const AcademicPage = lazy(() => import('./pages/AcademicPage'));
const OfficePage = lazy(() => import('./pages/OfficePage'));
const RecreationPage = lazy(() => import('./pages/RecreationPage'));
const FacilitiesPage = lazy(() => import('./pages/FacilitiesPage'));
const ReceptionPage = lazy(() => import('./pages/ReceptionPage'));
const SubmitNewsPage = lazy(() => import('./pages/SubmitNewsPage'));
const SuggestionsPage = lazy(() => import('./pages/SuggestionsPage'));
const ManageVideosPage = lazy(() => import('./pages/ManageVideosPage'));
const ManagePoliciesPage = lazy(() => import('./pages/ManagePoliciesPage'));

// A simple fallback UI while lazy components are loading
const PageLoader = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: 'var(--gray-50)' }}>
    <div style={{ width: 40, height: 40, border: '4px solid var(--gray-200)', borderTop: '4px solid var(--primary-600)', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
  </div>
);

function PrivateRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

function PublicRoute({ children }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

// Global module-level cache to persist across React Strict Mode remounts in development
let globalLastOneSignalUser = null;

function AppRoutes() {
  const { user } = useAuth();



  useEffect(() => {
    const oneSignalAppId = import.meta.env.VITE_ONESIGNAL_APP_ID;
    if (!oneSignalAppId) return;

    if (!user) {
      if (globalLastOneSignalUser !== null) {
        globalLastOneSignalUser = null;
        window.OneSignalDeferred = window.OneSignalDeferred || [];
        window.OneSignalDeferred.push(async function(OneSignal) {
          console.log('OneSignal: User logged out. Clearing external ID');
          try {
            await OneSignal.logout();
          } catch (e) {
            console.error('OneSignal logout error:', e);
          }
        });
      }
      return;
    }

    const targetId = String(user.id);

    // Skip synchronization if already logged in as target user
    if (globalLastOneSignalUser === targetId) {
      return;
    }

    // Lock immediately to prevent duplicate runs from React Strict Mode remounts
    globalLastOneSignalUser = targetId;

    const runSync = () => {
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function(OneSignal) {
        try {
          const currentExternalId = OneSignal.User.externalId;
          console.log('OneSignal: Aligning external ID to:', targetId, '(current local ID:', currentExternalId, ')');
          await OneSignal.login(targetId);
          console.log('OneSignal: Login call completed successfully for user:', targetId);
        } catch (err) {
          console.error('OneSignal login error:', err);
          globalLastOneSignalUser = null;
        }
      });
    };

    if (window.oneSignalInitialized) {
      runSync();
    } else {
      const handleInitComplete = () => {
        runSync();
      };
      window.addEventListener('onesignal-init-complete', handleInitComplete);
      return () => {
        window.removeEventListener('onesignal-init-complete', handleInitComplete);
      };
    }
  }, [user]);

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
          <Route path="/dashboard"  element={<PrivateRoute><Dashboard /></PrivateRoute>} />
          <Route path="/suggestions" element={<PrivateRoute><SuggestionsPage /></PrivateRoute>} />
          <Route path="/schedules"  element={<PrivateRoute><SchedulesPage /></PrivateRoute>} />
          <Route path="/calendar"   element={<PrivateRoute><CalendarPage /></PrivateRoute>} />
          <Route path="/checkin"    element={<PrivateRoute><CheckInPage /></PrivateRoute>} />
          <Route path="/clean-duty" element={<PrivateRoute><CleanDutyPage /></PrivateRoute>} />
          <Route path="/greeting-duty" element={<PrivateRoute><GreetingDutyPage /></PrivateRoute>} />
          <Route path="/my-attendance" element={<PrivateRoute><MyAttendancePage /></PrivateRoute>} />
          <Route path="/profile"    element={<PrivateRoute><MyStats /></PrivateRoute>} />
          <Route path="/settings"   element={<PrivateRoute><SettingsPage /></PrivateRoute>} />
          <Route path="/submit-news" element={<PrivateRoute><SubmitNewsPage /></PrivateRoute>} />
          <Route path="/admin"      element={<PrivateRoute><AdminPage /></PrivateRoute>} />
          <Route path="/admin-announcements" element={<PrivateRoute><AnnouncementsPage /></PrivateRoute>} />
          <Route path="/admin-videos" element={<PrivateRoute><ManageVideosPage /></PrivateRoute>} />
          <Route path="/admin-policies" element={<PrivateRoute><ManagePoliciesPage /></PrivateRoute>} />
          <Route path="/discipline" element={<PrivateRoute><DisciplinePage /></PrivateRoute>} />
          <Route path="/my-fines"   element={<PrivateRoute><MyFinesPage /></PrivateRoute>} />
          <Route path="/finance"    element={<PrivateRoute><FinancePage /></PrivateRoute>} />
          <Route path="/pr"          element={<PrivateRoute><PRPage /></PrivateRoute>} />
          <Route path="/av"          element={<PrivateRoute><AVPage /></PrivateRoute>} />
          <Route path="/secretary"   element={<PrivateRoute><SecretaryPage /></PrivateRoute>} />
          <Route path="/academic"    element={<PrivateRoute><AcademicPage /></PrivateRoute>} />
          <Route path="/office"      element={<PrivateRoute><OfficePage /></PrivateRoute>} />
          <Route path="/recreation"  element={<PrivateRoute><RecreationPage /></PrivateRoute>} />
          <Route path="/facilities"  element={<PrivateRoute><FacilitiesPage /></PrivateRoute>} />
          <Route path="/reception"   element={<PrivateRoute><ReceptionPage /></PrivateRoute>} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default function App() {
  useEffect(() => {
    const oneSignalAppId = import.meta.env.VITE_ONESIGNAL_APP_ID;
    if (oneSignalAppId) {
      const base = import.meta.env.BASE_URL || '/';
      
      // Patch: intercept service worker registration to fix path for subdirectory
      if (base !== '/' && 'serviceWorker' in navigator) {
        const originalRegister = navigator.serviceWorker.register.bind(navigator.serviceWorker);
        navigator.serviceWorker.register = function(scriptURL, options) {
          let url = typeof scriptURL === 'string' ? scriptURL : scriptURL.toString();
          // If OneSignal tries to register at root, redirect to subdirectory
          if (url.includes('OneSignalSDKWorker.js') && !url.includes(base)) {
            const urlObj = new URL(url, location.origin);
            urlObj.pathname = base + 'OneSignalSDKWorker.js';
            url = urlObj.href;
            console.log('Patched OneSignal SW path to:', url);
            // Also fix scope
            if (options && options.scope && !options.scope.includes(base)) {
              options = { ...options, scope: base };
              console.log('Patched OneSignal SW scope to:', base);
            }
          }
          return originalRegister(url, options);
        };

        const originalGetRegistration = navigator.serviceWorker.getRegistration.bind(navigator.serviceWorker);
        navigator.serviceWorker.getRegistration = function(scope) {
          const scopeStr = typeof scope === 'string' ? scope : '';
          // If OneSignal checks for registration scope at root, redirect to the subdirectory base scope
          if (scopeStr === '/' || (scopeStr && !scopeStr.includes(base))) {
            return originalGetRegistration(base);
          }
          return originalGetRegistration(scope);
        };
      }
      
      window.OneSignalDeferred = window.OneSignalDeferred || [];
      window.OneSignalDeferred.push(async function(OneSignal) {
        // SW Diagnostics
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(regs => {
            console.log('--- DIAGNOSTIC: Service Worker Registrations ---');
            console.log('Controller:', navigator.serviceWorker.controller ? navigator.serviceWorker.controller.scriptURL : 'None (Page not controlled!)');
            regs.forEach((r, idx) => {
              console.log(`[SW #${idx}] Scope: ${r.scope}`);
              console.log(`  - Active: ${r.active ? r.active.scriptURL + ' (' + r.active.state + ')' : 'None'}`);
              console.log(`  - Installing: ${r.installing ? r.installing.scriptURL + ' (' + r.installing.state + ')' : 'None'}`);
              console.log(`  - Waiting: ${r.waiting ? r.waiting.scriptURL + ' (' + r.waiting.state + ')' : 'None'}`);
            });
            console.log('------------------------------------------------');
          });
        }

        const initOptions = {
          appId: oneSignalAppId,
          allowLocalhostAsSecureOrigin: true,
          path: base,
          serviceWorkerPath: 'OneSignalSDKWorker.js',
          serviceWorkerParam: { scope: base },
          promptOptions: {
            slidedown: {
              prompts: [
                {
                  type: 'push',
                  autoPrompt: false
                }
              ]
            }
          }
        };
        console.log('OneSignal init with options:', JSON.stringify(initOptions));
        await OneSignal.init(initOptions);
        window.oneSignalInitialized = true;
        window.dispatchEvent(new CustomEvent('onesignal-init-complete'));
      });
    }
  }, []);

  useEffect(() => {
    // 1. Get the current active JavaScript file hash for admin app
    let localHash = '';
    const scripts = Array.from(document.querySelectorAll('script'));
    const currentScript = scripts.find(s => s.src && s.src.includes('/assets/admin-'));
    if (currentScript) {
      const match = currentScript.src.match(/\/assets\/admin-([^.]+)\.js/);
      if (match) {
        localHash = match[1];
      }
    }

    // 2. Fetch admin/index.html (1.4KB) and compare JS hash to detect new deployments
    const checkForUpdate = async () => {
      if (!localHash) return;
      try {
        const res = await fetch('./admin/index.html?t=' + Date.now(), { cache: 'no-store' });
        if (!res.ok) return;
        const text = await res.text();
        const match = text.match(/src="[^"]*\/assets\/admin-([^.]+)\.js"/);
        if (match && match[1]) {
          const serverHash = match[1];
          if (serverHash !== localHash) {
            console.log("New version detected. Reloading app automatically...");
            window.location.reload();
          }
        }
      } catch (err) {
        console.error("Auto-update check failed:", err);
      }
    };

    // Check on mount
    checkForUpdate();

    // Check when user resumes the app (tab focus / visibility)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', checkForUpdate);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', checkForUpdate);
    };
  }, []);

  return (
    <HashRouter>
      <AuthProvider>
        <PageTracker />
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
