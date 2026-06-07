import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useOutletContext } from "react-router-dom";
import { apiGet } from "./api";
import { signOut } from "./supabase";
import { SUPPORT_EMAIL } from "./support";
import { CHROME_STORE_URL } from "./links";
import Icon from "./Icon";

type DashboardContext = { balance: number | null; refetchBalance: () => void; email: string };

export function useDashboard() {
  return useOutletContext<DashboardContext>();
}

// No "Credits" entry — the Buy Credits button at the sidebar bottom already
// routes to /buy, so a nav item would be redundant.
const NAV = [
  { to: "/account", label: "Dashboard", icon: "dashboard", end: true },
  { to: "/billing", label: "History", icon: "history", end: false },
  { to: "/profile", label: "Profile", icon: "person", end: false },
  { to: "/preferences", label: "Preferences", icon: "tune", end: false },
  { to: "/getting-started", label: "Guide", icon: "menu_book", end: false },
];

// The WaterlooWorks jobs page — where the extension actually runs.
const WW_URL = "https://waterlooworks.uwaterloo.ca/myAccount/co-op/full/jobs.htm";

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
            <p className="break-all font-label-sm text-label-sm text-text-secondary">{email}</p>
          </div>
        </div>

        <nav className="flex-1 space-y-base">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={sideLink}>
              <Icon name={n.icon} />
              {n.label}
            </NavLink>
          ))}
          <a
            href={WW_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-sm rounded-lg px-sm py-sm font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-highest"
          >
            <Icon name="open_in_new" />
            WaterlooWorks
          </a>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-sm rounded-lg px-sm py-sm font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-highest"
          >
            <Icon name="extension" />
            Chrome Web Store
          </a>
        </nav>

        <div className="mt-auto space-y-base border-t border-border pt-xl">
          <Link
            to="/buy"
            className="mb-lg flex w-full items-center justify-center gap-xs rounded-lg bg-primary px-[20px] py-sm font-label-md text-label-md text-on-primary shadow-sm transition-colors hover:bg-accent-hover"
          >
            <Icon name="add_circle" className="text-[18px]" />
            Buy Credits
          </Link>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex w-full items-center gap-sm rounded-lg px-sm py-sm font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-highest"
          >
            <Icon name="help" />
            Support
          </a>
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
        <footer className="mx-auto flex max-w-max-width flex-col items-center gap-xs px-gutter pb-lg font-label-sm text-label-sm text-text-muted">
          <div className="flex justify-center gap-md">
            <Link to="/terms" className="transition-colors hover:text-text-secondary hover:underline">Terms</Link>
            <Link to="/privacy" className="transition-colors hover:text-text-secondary hover:underline">Privacy</Link>
          </div>
          <p className="text-center">Not affiliated with the University of Waterloo or WaterlooWorks.</p>
        </footer>
      </main>
    </div>
  );
}
