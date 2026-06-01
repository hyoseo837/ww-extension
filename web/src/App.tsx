import { Route, Routes } from "react-router-dom";
import { useSession } from "./useSession";
import Layout from "./Layout";
import Landing from "./pages/Landing";
import Account from "./pages/Account";
import Billing from "./pages/Billing";
import Buy from "./pages/Buy";
import Profile from "./pages/Profile";
import Preferences from "./pages/Preferences";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";
import Privacy from "./pages/legal/Privacy";
import Terms from "./pages/legal/Terms";

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
      {/* Legal pages render outside the app shell — identical to logged-out. */}
      <Route path="/privacy" element={<Privacy />} />
      <Route path="/terms" element={<Terms />} />
      <Route element={<Layout email={session.user.email ?? ""} />}>
        <Route path="/account" element={<Account />} />
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
