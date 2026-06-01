import { Navigate, Route, Routes } from "react-router-dom";
import { useSession } from "./useSession";
import Layout from "./Layout";
import Landing from "./pages/Landing";
import Account from "./pages/Account";
import Billing from "./pages/Billing";
import Buy from "./pages/Buy";
import Profile from "./pages/Profile";
import Preferences from "./pages/Preferences";
import Admin from "./pages/Admin";

export default function App() {
  const { session, loading } = useSession();

  if (loading) {
    return (
      <div className="center">
        <p className="muted">Loading…</p>
      </div>
    );
  }
  if (!session) return <Landing />;

  return (
    <Routes>
      {/* Admin console — its own shell, gated server-side (403 → access denied). */}
      <Route path="/admin" element={<Admin />} />
      <Route element={<Layout email={session.user.email ?? ""} />}>
        <Route path="/account" element={<Account />} />
        <Route path="/billing" element={<Billing />} />
        <Route path="/buy" element={<Buy />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/preferences" element={<Preferences />} />
        <Route path="*" element={<Navigate to="/account" replace />} />
      </Route>
    </Routes>
  );
}
