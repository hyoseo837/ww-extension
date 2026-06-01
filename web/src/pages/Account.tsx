import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { useDashboard } from "../Layout";
import HistoryList, { type Entry } from "../HistoryList";
import Icon from "../Icon";
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

export default function Account() {
  const { balance, email } = useDashboard();
  const [recent, setRecent] = useState<Entry[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    apiGet<{ entries: Entry[] }>("/credits/history?limit=25").then((d) => setRecent(d.entries)).catch(() => {});
    apiGet<Profile>("/profile").then(setProfile).catch(() => {});
  }, []);

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
            <div className="mb-xs font-display-lg text-display-lg text-on-surface">{balance === null ? "…" : balance}</div>
            <p className="mb-xl font-body-md text-body-md text-text-secondary">1 credit ≈ $0.01 CAD.</p>
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
          <HistoryList entries={recent} limitRows={6} />
        </div>
      </div>
    </div>
  );
}
