import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { apiGet } from "./api";
import { setupDone } from "./types";
import type { Profile as ProfileData } from "./types"; // page component Profile is imported below
import { useSession } from "./useSession";
import Layout from "./Layout";
import Landing from "./pages/Landing";
import Account from "./pages/Account";
import Billing from "./pages/Billing";
import Buy from "./pages/Buy";
import Profile from "./pages/Profile";
import Preferences from "./pages/Preferences";
import PreferencesSetup from "./pages/PreferencesSetup";
import GettingStarted from "./pages/GettingStarted";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/legal/Privacy";
import Terms from "./pages/legal/Terms";

// Setup gate (ADR 0040): shell routes redirect to the wizard until match
// preferences exist. Fails open on API errors — the gate funnels new users,
// it must never lock the app.
function SetupGate({ children }: { children: ReactNode }) {
  const [done, setDone] = useState<boolean | null>(null);
  useEffect(() => {
    apiGet<ProfileData>("/profile")
      .then((p) => setDone(setupDone(p.match_criteria)))
      .catch(() => setDone(true));
  }, []);
  if (done === null) {
    return (
      <div className="center">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!done) return <Navigate to="/preferences/setup" replace />;
  return <>{children}</>;
}

export default function App() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="center">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  // Logged out: only the landing + the public legal pages exist. The legal
  // routes must resolve without a session (footer links, consent-at-signup,
  // and external links from the README + extension); everything else falls
  // back to the landing.
  if (!session) {
    return (
      <Routes>
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    );
  }

  return (
    <Routes>
      {/* Admin console — its own shell, gated server-side (403 → access denied). */}
      <Route path="/admin" element={<Admin />} />
      {/* Setup wizard — focused full-screen flow outside the shell (ADR 0040). */}
      <Route path="/preferences/setup" element={<PreferencesSetup />} />
      {/* Legal pages render outside the app shell — identical to logged-out. */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route element={<SetupGate><Layout email={session.user.email ?? ""} /></SetupGate>}>
        <Route path="/account" element={<Account />} />
        <Route path="/getting-started" element={<GettingStarted />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/buy" element={<Buy />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/preferences" element={<Preferences />} />
        {/* Real 404 (v6.15) — was a silent redirect to /account. */}
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
