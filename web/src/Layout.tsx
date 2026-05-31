import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import { apiGet } from "./api";
import { signOut } from "./supabase";

type DashboardContext = { balance: number | null; refetchBalance: () => void };

// Pages read the shared balance + a refetcher (keeps the top-bar pill in
// sync after a purchase) via the Outlet context.
export function useDashboard() {
  return useOutletContext<DashboardContext>();
}

export default function Layout({ email }: { email: string }) {
  const [balance, setBalance] = useState<number | null>(null);

  const refetchBalance = useCallback(() => {
    apiGet<{ balance: number }>("/credits/balance")
      .then((b) => setBalance(b.balance))
      .catch(() => setBalance(null));
  }, []);

  useEffect(() => {
    refetchBalance();
  }, [refetchBalance]);

  return (
    <>
      <header className="topbar">
        <span className="brand">WW Scorer</span>
        <div className="topbar-right">
          <span className="pill">{balance === null ? "…" : `${balance} credits`}</span>
          <span className="email">{email}</span>
          <button className="btn" onClick={() => signOut()}>Sign out</button>
        </div>
      </header>
      <nav className="nav">
        <NavLink to="/account">Account</NavLink>
        <NavLink to="/billing">Billing</NavLink>
        <NavLink to="/buy">Buy credits</NavLink>
      </nav>
      <Outlet context={{ balance, refetchBalance } satisfies DashboardContext} />
    </>
  );
}
