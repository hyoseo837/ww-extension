import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useOutletContext } from "react-router-dom";
import { apiGet } from "./api";
import { signOut } from "./supabase";
import Icon from "./Icon";

type DashboardContext = { balance: number | null; refetchBalance: () => void; email: string };

export function useDashboard() {
  return useOutletContext<DashboardContext>();
}

const NAV = [
  { to: "/account", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/buy", label: "Credits", icon: "payments", end: false },
  { to: "/billing", label: "History", icon: "history", end: false },
  { to: "/profile", label: "Profile", icon: "person", end: false },
];

const sideLink = ({ isActive }: { isActive: boolean }) =>
  [
    "flex items-center gap-sm rounded-lg px-sm py-sm font-label-md text-label-md transition-colors",
    isActive
      ? "bg-secondary-container text-on-secondary-container"
      : "text-on-surface-variant hover:bg-surface-container-highest",
  ].join(" ");

const topLink = ({ isActive }: { isActive: boolean }) =>
  [
    "font-body-md text-body-md transition-colors",
    isActive ? "text-primary border-b-2 border-primary pb-1" : "text-text-secondary hover:text-primary",
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
    <div className="min-h-screen bg-page-bg">
      {/* Mobile top bar */}
      <header className="sticky top-0 z-50 border-b border-border bg-surface-bright md:hidden">
        <div className="flex h-16 items-center justify-between px-gutter">
          <span className="font-headline-md text-headline-md font-semibold text-primary">WW Scorer</span>
          <nav className="flex gap-md">
            <NavLink to="/account" end className={topLink}>Dashboard</NavLink>
            <NavLink to="/buy" className={topLink}>Credits</NavLink>
            <NavLink to="/billing" className={topLink}>History</NavLink>
            <NavLink to="/profile" className={topLink}>Profile</NavLink>
          </nav>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border bg-surface-container-low p-md md:flex">
        <div className="mb-xl flex items-center gap-sm px-sm py-md">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-container font-headline-md text-headline-md text-on-secondary-container">
            {initial}
          </div>
          <div className="min-w-0">
            <h2 className="font-headline-md text-headline-md leading-tight text-primary">WW Scorer</h2>
            <p className="truncate font-label-md text-label-md text-text-secondary">{email}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-base">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={sideLink}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto space-y-base border-t border-border pt-xl">
          <Link
            to="/buy"
            className="mb-lg flex w-full items-center justify-center gap-xs rounded-lg bg-primary px-[20px] py-sm font-label-md text-label-md text-on-primary shadow-sm transition-colors hover:bg-accent-hover"
          >
            <Icon name="add_circle" className="text-[18px]" />
            Buy Credits
          </Link>
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-sm rounded-lg px-sm py-sm font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-highest"
          >
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="pb-xxl md:ml-64">
        <Outlet context={{ balance, refetchBalance, email } satisfies DashboardContext} />
      </main>
    </div>
  );
}
