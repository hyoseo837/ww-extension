import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiDelete, apiGet } from "../api";
import { signOut } from "../supabase";
import { useDashboard } from "../Layout";
import HistoryList, { type Entry } from "../HistoryList";
import Icon from "../Icon";
import { creditUnit, fmtBalance } from "../format";
import type { Profile } from "../types";

const CARD = "rounded-xl border border-border bg-surface p-lg shadow-[0_2px_8px_rgba(0,0,0,0.02)]";

function SnapRow({ label, value, dot }: { label: string; value: string; dot?: "ok" | "muted" }) {
  return (
    <div className="border-b border-border py-base last:border-0">
      <div className="font-label-sm text-label-sm text-text-secondary">{label}</div>
      <div className="flex items-center gap-xs font-body-md text-body-md text-on-surface">
        {dot && <span className={`inline-block h-2 w-2 rounded-full ${dot === "ok" ? "bg-positive" : "bg-text-muted"}`} />}
        {value}
      </div>
    </div>
  );
}

// Type-DELETE confirmation before the irreversible account deletion (v6.9).
function ConfirmDelete({
  onConfirm,
  onCancel,
  deleting,
  error,
}: {
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
  error: string | null;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !deleting && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, deleting]);
  const armed = text.trim().toUpperCase() === "DELETE";
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/30 p-gutter"
      onClick={() => !deleting && onCancel()}
    >
      <div className={`${CARD} w-full max-w-md`} onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-sm font-headline-md text-headline-md text-on-surface">Delete account?</h2>
        <p className="mb-md font-body-md text-body-md text-text-secondary">
          This permanently deletes your account and all your data — profile, credit history, scans, and any remaining
          credits. It can't be undone, and credits are non-refundable. Your purchase records remain in Stripe.
        </p>
        <label className="mb-xs block font-label-sm text-label-sm text-text-secondary">
          Type <span className="font-semibold text-on-surface">DELETE</span> to confirm
        </label>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="DELETE"
          autoFocus
          className="w-full rounded-lg border border-border bg-surface px-sm py-base font-body-md text-body-md"
        />
        {error && <p className="mt-sm font-label-sm text-label-sm text-negative">{error}</p>}
        <div className="mt-lg flex justify-end gap-sm">
          <button
            onClick={onCancel}
            disabled={deleting}
            className="rounded-lg border border-border px-lg py-sm font-label-md text-label-md text-on-surface hover:bg-surface-alt disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={!armed || deleting}
            className="rounded-lg bg-negative px-lg py-sm font-label-md text-label-md text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {deleting ? "Deleting…" : "Delete my account"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Account() {
  const { balance, email } = useDashboard();
  const [recent, setRecent] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadingRecent, setLoadingRecent] = useState(true);
  const [recentError, setRecentError] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [dataError, setDataError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ entries: Entry[] }>("/credits/history?limit=25")
      .then((d) => setRecent(d.entries))
      .catch(() => setRecentError(true))
      .finally(() => setLoadingRecent(false));
    apiGet<Profile>("/profile").then(setProfile).catch(() => {});
  }, []);

  async function downloadData() {
    setDownloading(true);
    setDataError(null);
    try {
      const data = await apiGet<unknown>("/account/export");
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ww-scorer-data-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setDataError(`Could not export your data: ${e}`);
    } finally {
      setDownloading(false);
    }
  }

  async function deleteAccount() {
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiDelete("/account");
      await signOut(); // session change re-renders App → logged-out landing
    } catch (e) {
      setDeleteError(`Could not delete your account: ${e}`);
      setDeleting(false);
    }
  }

  const name = email ? email.split("@")[0] : "";
  const pj = profile?.profile_json;
  const cvReady = !!(pj && (pj.summary || pj.experience.length || profile?.cv_text));
  const topLocation = profile?.match_criteria.preferred_locations.preferred[0];
  const targetTerm = profile?.match_criteria.target_term.preferred[0];

  return (
    <div className="mx-auto max-w-max-width space-y-xxl p-gutter lg:p-xxl">
      <section className="mt-md">
        <h1 className="mb-xs font-display-lg-mobile text-display-lg-mobile text-on-surface md:font-display-lg md:text-display-lg">
          Welcome back{name ? `, ${name}` : ""}
        </h1>
        <p className="font-body-lg text-body-lg text-text-secondary">Your credits and scoring overview.</p>
      </section>

      <div className="grid grid-cols-1 gap-lg md:grid-cols-3">
        {/* Balance */}
        <div className={`${CARD} relative flex flex-col justify-between overflow-hidden md:col-span-2`}>
          <div className="pointer-events-none absolute right-0 top-0 p-lg opacity-10">
            <Icon name="generating_tokens" className="text-[120px] text-primary" />
          </div>
          <div>
            <h3 className="mb-sm font-label-md text-label-md uppercase tracking-widest text-text-muted">Available credits</h3>
            <div className="mb-xs font-display-lg text-display-lg text-on-surface">
              {balance === null ? "…" : (
                <>
                  {fmtBalance(balance)}
                  <span className="ml-xs font-body-md text-body-md text-text-secondary">{creditUnit(balance)}</span>
                </>
              )}
            </div>
            <p className="mb-xl font-body-md text-body-md text-text-secondary">About 1 credit per scan.</p>
          </div>
          <Link
            to="/buy"
            className="inline-flex items-center gap-xs self-start rounded-lg bg-primary px-[24px] py-[12px] font-label-md text-label-md text-on-primary shadow-sm transition-colors hover:bg-accent-hover"
          >
            <Icon name="add_circle" className="text-[18px]" />
            Buy credits
          </Link>
        </div>

        {/* Profile snapshot */}
        <div className={`${CARD} flex flex-col`}>
          <h3 className="mb-md font-label-md text-label-md uppercase tracking-widest text-text-muted">Profile snapshot</h3>
          <div className="flex-1">
            <SnapRow label="CV status" value={cvReady ? "Active & ready" : "Not set up"} dot={cvReady ? "ok" : "muted"} />
            <SnapRow label="Top location" value={topLocation || "—"} />
            <SnapRow label="Target term" value={targetTerm || "—"} />
          </div>
          <div className="mt-md flex flex-col gap-xs">
            <Link
              to="/profile"
              className="rounded-lg border border-border bg-surface-bright px-[20px] py-sm text-center font-label-md text-label-md text-primary transition-colors hover:bg-surface-container-low"
            >
              Edit profile
            </Link>
            <Link
              to="/preferences"
              className="rounded-lg border border-border bg-surface-bright px-[20px] py-sm text-center font-label-md text-label-md text-primary transition-colors hover:bg-surface-container-low"
            >
              Edit preferences
            </Link>
          </div>
        </div>

        {/* Recent activity */}
        <div className={`${CARD} md:col-span-3`}>
          <div className="mb-md flex items-end justify-between border-b border-border pb-sm">
            <h3 className="font-headline-md text-headline-md text-on-surface">Recent activity</h3>
            <Link to="/billing" className="font-label-md text-label-md text-primary hover:text-accent-hover">View all</Link>
          </div>
          {loadingRecent ? (
            <p className="font-body-md text-body-md text-text-muted">Loading…</p>
          ) : recentError ? (
            <p className="font-body-md text-body-md text-negative">Couldn't load recent activity. Refresh to try again.</p>
          ) : (
            <HistoryList entries={recent} limitRows={6} />
          )}
        </div>
      </div>

      {/* Your data */}
      <section className={CARD}>
        <h3 className="mb-xs font-headline-md text-headline-md text-on-surface">Your data</h3>
        <p className="mb-md font-body-md text-body-md text-text-secondary">
          Download everything we store about you — account, credit history, scans, and profile — as a JSON file.
        </p>
        <div className="flex items-center gap-md">
          <button
            onClick={downloadData}
            disabled={downloading}
            className="inline-flex items-center gap-xs rounded-lg border border-border bg-surface-bright px-lg py-sm font-label-md text-label-md text-primary transition-colors hover:bg-surface-container-low disabled:opacity-60"
          >
            <Icon name="download" className="text-[18px]" />
            {downloading ? "Preparing…" : "Download my data"}
          </button>
          {dataError && <span className="font-label-sm text-label-sm text-negative">{dataError}</span>}
        </div>
      </section>

      {/* Danger zone */}
      <section className={CARD}>
        <h3 className="mb-xs font-headline-md text-headline-md text-negative">Danger zone</h3>
        <p className="mb-md font-body-md text-body-md text-text-secondary">
          Permanently delete your account and all associated data. This can't be undone.
        </p>
        <button
          onClick={() => {
            setDeleteError(null);
            setConfirmDelete(true);
          }}
          className="inline-flex items-center gap-xs rounded-lg border border-negative px-lg py-sm font-label-md text-label-md text-negative transition-colors hover:bg-negative/10"
        >
          <Icon name="delete" className="text-[18px]" />
          Delete account
        </button>
      </section>

      {confirmDelete && (
        <ConfirmDelete
          deleting={deleting}
          error={deleteError}
          onCancel={() => setConfirmDelete(false)}
          onConfirm={deleteAccount}
        />
      )}
    </div>
  );
}
