import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPost } from "../api";
import { signOut } from "../supabase";
import Icon from "../Icon";
import HistoryList, { type Entry } from "../HistoryList";

type Stats = { total_users: number; total_credits_issued: number; credits_used_24h: number };
type AdminUser = { user_id: string; email: string | null; created_at: string; balance: number };
type Scan = {
  id: string; kind: string; status: string;
  org: string | null; title: string | null; cost: number | null; created_at: string;
};
type Detail = AdminUser & { profile: { cv_ready: boolean; summary: string | null }; scans: Scan[]; history: Entry[] };

const CARD = "rounded-xl border border-border bg-surface p-lg shadow-[0_2px_8px_rgba(41,38,31,0.04)]";
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();
const isForbidden = (e: unknown) => e instanceof Error && e.message.startsWith("403");

// Compact for the big stat numbers (128500 → "128.5k").
function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return Math.round(n).toLocaleString();
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className={CARD}>
      <h3 className="mb-sm font-label-sm text-label-sm uppercase tracking-widest text-text-muted">{label}</h3>
      <div className="font-display-lg-mobile text-display-lg-mobile text-primary">{value}</div>
    </div>
  );
}

function InspectModal({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-on-surface/30 p-gutter" onClick={onClose}>
      <div className={`${CARD} mt-xl w-full max-w-2xl`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-md flex items-start justify-between gap-md border-b border-border pb-sm">
          <div>
            <h2 className="font-headline-md text-headline-md text-on-surface">{detail.email ?? "—"}</h2>
            <p className="font-label-sm text-label-sm text-text-muted">
              Joined {fmtDate(detail.created_at)} · {detail.profile.cv_ready ? "CV ready" : "no CV"}
            </p>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-on-surface">
            <Icon name="close" />
          </button>
        </div>

        <div className="mb-lg flex items-baseline gap-xs">
          <span className="font-headline-lg text-headline-lg text-on-surface">{detail.balance.toLocaleString()}</span>
          <span className="font-body-md text-body-md text-text-secondary">credits</span>
        </div>

        <h3 className="mb-sm font-label-md text-label-md uppercase tracking-wider text-text-muted">Credit history</h3>
        <HistoryList entries={detail.history} limitRows={10} />

        <h3 className="mb-sm mt-lg font-label-md text-label-md uppercase tracking-wider text-text-muted">Recent scans</h3>
        {detail.scans.length === 0 ? (
          <p className="font-body-md text-body-md text-text-muted">No scans yet.</p>
        ) : (
          <div className="flex flex-col">
            {detail.scans.map((s) => (
              <div key={s.id} className="flex items-center justify-between border-b border-border py-xs last:border-0">
                <span className="font-body-md text-body-md text-on-surface">
                  {s.kind === "profile_extract" ? "Profile extract" : s.org || s.title || "Scan"}
                </span>
                <span className="font-label-sm text-label-sm text-text-muted">
                  {s.status} · {fmtDate(s.created_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Admin() {
  const [access, setAccess] = useState<"loading" | "ok" | "denied" | "error">("loading");
  const [stats, setStats] = useState<Stats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [search, setSearch] = useState("");
  const [detail, setDetail] = useState<Detail | null>(null);

  const [giftEmail, setGiftEmail] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftReason, setGiftReason] = useState("");
  const [giftBusy, setGiftBusy] = useState(false);
  const [giftMsg, setGiftMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const loadUsers = useCallback(async (q: string) => {
    const d = await apiGet<{ users: AdminUser[] }>(`/admin/users?search=${encodeURIComponent(q)}`);
    setUsers(d.users);
  }, []);

  const loadStats = useCallback(async () => {
    setStats(await apiGet<Stats>("/admin/stats"));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await Promise.all([loadStats(), loadUsers("")]);
        setAccess("ok");
      } catch (e) {
        setAccess(isForbidden(e) ? "denied" : "error");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function view(userId: string) {
    try {
      setDetail(await apiGet<Detail>(`/admin/users/${userId}`));
    } catch {
      /* ignore — modal just won't open */
    }
  }

  function manage(email: string | null) {
    setGiftEmail(email ?? "");
    setGiftMsg(null);
    document.getElementById("gift-form")?.scrollIntoView({ behavior: "smooth" });
  }

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setGiftBusy(true);
    setGiftMsg(null);
    try {
      const res = await apiPost<{ user_id: string; balance: number }>("/admin/grant", {
        email: giftEmail.trim(),
        credits: Number(giftAmount),
        reason: giftReason.trim() || null,
      });
      setGiftMsg({ ok: true, text: `Granted ${giftAmount} credits — new balance ${res.balance.toLocaleString()}.` });
      setGiftAmount("");
      setGiftReason("");
      await Promise.all([loadStats(), loadUsers(search)]);
    } catch (err) {
      setGiftMsg({ ok: false, text: String(err instanceof Error ? err.message : err) });
    } finally {
      setGiftBusy(false);
    }
  }

  if (access === "loading") {
    return <div className="flex min-h-screen items-center justify-center bg-page-bg font-body-md text-text-muted">Loading…</div>;
  }
  if (access !== "ok") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-md bg-page-bg px-gutter text-center">
        <Icon name="lock" className="text-[48px] text-text-muted" />
        <h1 className="font-headline-lg text-headline-lg text-on-surface">
          {access === "denied" ? "Admins only" : "Something went wrong"}
        </h1>
        <p className="font-body-md text-body-md text-text-secondary">
          {access === "denied" ? "Your account isn't authorized for the admin console." : "Could not load the admin console."}
        </p>
        <Link to="/account" className="rounded-lg bg-primary px-lg py-sm font-label-md text-label-md text-on-primary hover:bg-accent-hover">
          Back to app
        </Link>
      </div>
    );
  }

  const inputCls =
    "w-full rounded-lg border border-border bg-surface px-md py-sm font-body-md text-body-md text-on-surface placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="min-h-screen bg-page-bg">
      {/* Desktop sidebar */}
      <aside className="fixed left-0 top-0 z-40 hidden h-screen w-64 flex-col border-r border-border bg-surface-container-low p-md md:flex">
        <div className="mb-xl flex items-center gap-sm px-sm py-md">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-secondary-container font-headline-md text-headline-md text-on-secondary-container">
            <Icon name="shield_person" />
          </div>
          <div className="min-w-0">
            <h2 className="font-headline-md text-headline-md leading-tight text-primary">Admin Console</h2>
            <p className="truncate font-label-sm text-label-sm text-text-secondary">System Administrator</p>
          </div>
        </div>
        <nav className="flex-1">
          <span className="flex items-center gap-sm rounded-lg bg-secondary-container px-sm py-sm font-label-md text-label-md text-on-secondary-container">
            <Icon name="dashboard" />
            Dashboard
          </span>
        </nav>
        <div className="mt-auto space-y-base border-t border-border pt-xl">
          <Link to="/account" className="flex w-full items-center gap-sm rounded-lg px-sm py-sm font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-highest">
            <Icon name="arrow_back" />
            Back to app
          </Link>
          <button onClick={() => signOut()} className="flex w-full items-center gap-sm rounded-lg px-sm py-sm font-label-md text-label-md text-on-surface-variant transition-colors hover:bg-surface-container-highest">
            <Icon name="logout" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b border-border bg-surface-bright px-gutter md:hidden">
        <span className="font-headline-md text-headline-md font-semibold text-primary">Admin Console</span>
        <Link to="/account" className="font-label-md text-label-md text-text-secondary hover:text-primary">Back</Link>
      </header>

      <main className="md:ml-64">
        <div className="mx-auto max-w-max-width space-y-xl p-gutter lg:p-xxl">
          <section>
            <h1 className="mb-xs font-display-lg-mobile text-display-lg-mobile text-on-surface md:font-display-lg md:text-display-lg">
              Admin Console
            </h1>
            <p className="font-body-lg text-body-lg text-text-secondary">Users, credits, and gift grants.</p>
          </section>

          {/* Stats */}
          <div className="grid grid-cols-1 gap-lg md:grid-cols-3">
            <StatCard label="Total users" value={stats ? stats.total_users.toLocaleString() : "…"} />
            <StatCard label="Total credits issued" value={stats ? fmtCompact(stats.total_credits_issued) : "…"} />
            <StatCard label="Credits used (last 24h)" value={stats ? fmtCompact(stats.credits_used_24h) : "…"} />
          </div>

          {/* User management */}
          <section className={CARD}>
            <div className="mb-md flex flex-col items-start justify-between gap-md md:flex-row md:items-center">
              <h2 className="font-headline-md text-headline-md text-on-surface">User Management</h2>
              <form
                onSubmit={(e) => { e.preventDefault(); loadUsers(search).catch(() => {}); }}
                className="relative w-full md:w-80"
              >
                <span className="pointer-events-none absolute left-sm top-1/2 -translate-y-1/2 text-text-muted">
                  <Icon name="search" className="text-[20px]" />
                </span>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by email…"
                  className={`${inputCls} pl-[40px]`}
                />
              </form>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-sm font-label-sm text-label-sm uppercase tracking-wider text-text-muted">User</th>
                    <th className="pb-sm font-label-sm text-label-sm uppercase tracking-wider text-text-muted">Join date</th>
                    <th className="pb-sm font-label-sm text-label-sm uppercase tracking-wider text-text-muted">Balance</th>
                    <th className="pb-sm text-right font-label-sm text-label-sm uppercase tracking-wider text-text-muted">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.length === 0 ? (
                    <tr><td colSpan={4} className="py-md font-body-md text-body-md text-text-muted">No users found.</td></tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.user_id} className="border-b border-border transition-colors last:border-0 hover:bg-surface-alt">
                        <td className="py-sm font-body-md text-body-md text-on-surface">{u.email ?? "—"}</td>
                        <td className="py-sm font-body-md text-body-md text-text-secondary">{fmtDate(u.created_at)}</td>
                        <td className="py-sm font-body-md text-body-md text-on-surface">{u.balance.toLocaleString()}</td>
                        <td className="py-sm">
                          <div className="flex items-center justify-end gap-md">
                            <button onClick={() => view(u.user_id)} className="font-label-md text-label-md text-text-secondary hover:text-primary">View</button>
                            <button onClick={() => manage(u.email)} className="rounded-lg border border-border px-md py-base font-label-md text-label-md text-primary transition-colors hover:bg-surface-alt">Manage credits</button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* Gift credits */}
          <section id="gift-form" className={CARD}>
            <h2 className="mb-md font-headline-md text-headline-md text-on-surface">Issue Gift Credits</h2>
            <form onSubmit={grant} className="flex max-w-xl flex-col gap-md">
              <label className="flex flex-col gap-xs">
                <span className="font-label-md text-label-md text-text-secondary">User email</span>
                <input type="email" required value={giftEmail} onChange={(e) => setGiftEmail(e.target.value)} placeholder="e.g. user@domain.com" className={inputCls} />
              </label>
              <label className="flex flex-col gap-xs">
                <span className="font-label-md text-label-md text-text-secondary">Credit amount</span>
                <input type="number" required min="1" step="1" value={giftAmount} onChange={(e) => setGiftAmount(e.target.value)} placeholder="0" className={inputCls} />
              </label>
              <label className="flex flex-col gap-xs">
                <span className="font-label-md text-label-md text-text-secondary">Reason / note</span>
                <textarea rows={3} value={giftReason} onChange={(e) => setGiftReason(e.target.value)} placeholder="Support resolution, beta tester reward…" className={inputCls} />
              </label>
              {giftMsg && (
                <p className={`font-body-md text-body-md ${giftMsg.ok ? "text-positive" : "text-negative"}`}>{giftMsg.text}</p>
              )}
              <button
                type="submit"
                disabled={giftBusy}
                className="flex items-center gap-xs self-start rounded-lg bg-primary px-lg py-sm font-label-md text-label-md text-on-primary shadow-sm transition-colors hover:bg-accent-hover disabled:opacity-60"
              >
                <Icon name="card_giftcard" className="text-[18px]" />
                {giftBusy ? "Granting…" : "Grant gift credits"}
              </button>
            </form>
          </section>

          <footer className="border-t border-border pt-lg">
            <p className="font-label-sm text-label-sm text-text-muted">WW Scorer — admin console. Operator-only.</p>
          </footer>
        </div>
      </main>

      {detail && <InspectModal detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
