import { useCallback, useEffect, useState } from "react";
import { NavLink, Outlet, useOutletContext } from "react-router-dom";
import { apiGet } from "./api";
import { signOut } from "./supabase";

type DashboardContext = { balance: number | null; refetchBalance: () => void };

export function useDashboard() {
  return useOutletContext<DashboardContext>();
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  [
    "font-label-md text-label-md transition-colors",
    isActive
      ? "text-primary border-b-2 border-primary pb-1"
      : "text-text-secondary hover:text-primary",
  ].join(" ");

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

  const initial = (email.trim()[0] || "?").toUpperCase();

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="sticky top-0 z-50 w-full border-b border-border bg-surface-bright">
        <div className="mx-auto flex h-16 max-w-max-width items-center justify-between px-gutter">
          <div className="flex items-center gap-xl">
            <NavLink to="/account" className="font-headline-md text-headline-md font-semibold text-primary">
              WW Scorer
            </NavLink>
            <div className="flex items-center gap-md">
              <NavLink to="/account" className={navLink} end>Dashboard</NavLink>
              <NavLink to="/profile" className={navLink}>Profile</NavLink>
              <NavLink to="/billing" className={navLink}>History</NavLink>
              <NavLink to="/buy" className={navLink}>Buy credits</NavLink>
            </div>
          </div>
          <div className="flex items-center gap-sm">
            <span className="rounded-full bg-accent-soft px-md py-base font-label-sm text-label-sm text-primary">
              {balance === null ? "…" : `${balance} credits`}
            </span>
            <div
              title={email}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-secondary-container font-label-md text-label-md text-on-secondary-container"
            >
              {initial}
            </div>
            <button
              onClick={() => signOut()}
              className="font-label-md text-label-md text-text-secondary transition-colors hover:text-primary"
            >
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <main className="w-full flex-grow">
        <Outlet context={{ balance, refetchBalance } satisfies DashboardContext} />
      </main>

      <footer className="mt-xxl w-full border-t border-border py-xl">
        <div className="mx-auto flex max-w-max-width items-center justify-between px-gutter">
          <span className="font-label-sm text-label-sm text-text-muted">
            © 2026 WW Scorer · Built for Waterloo students.
          </span>
        </div>
      </footer>
    </div>
  );
}
