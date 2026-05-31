import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { useDashboard } from "../Layout";
import HistoryList, { type Entry } from "../HistoryList";

const CARD = "rounded-xl border border-border bg-surface p-lg shadow-[0_2px_8px_rgba(41,38,31,0.04)]";

export default function Account() {
  const { balance } = useDashboard();
  const [recent, setRecent] = useState<Entry[]>([]);

  useEffect(() => {
    // Wide enough that a batch isn't truncated; HistoryList shows the first few.
    apiGet<{ entries: Entry[] }>("/credits/history?limit=25")
      .then((d) => setRecent(d.entries))
      .catch(() => setRecent([]));
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-max-width flex-col gap-xl px-gutter py-xl">
      <header className="flex flex-col gap-xs">
        <h1 className="font-display-lg text-display-lg text-on-surface">Your account</h1>
        <p className="font-body-lg text-body-lg text-text-secondary">
          Your credits and recent scoring activity.
        </p>
      </header>

      <section className={`${CARD} flex flex-col gap-sm`}>
        <span className="font-label-md text-label-md uppercase tracking-wider text-text-muted">
          Available credits
        </span>
        <div className="font-headline-lg text-headline-lg text-on-surface">
          {balance === null ? "…" : balance}
        </div>
        <p className="font-body-md text-body-md text-text-secondary">1 credit ≈ $0.01 CAD</p>
        <Link
          to="/buy"
          className="mt-sm self-start rounded-lg bg-primary px-lg py-sm font-label-md text-label-md text-on-primary transition-colors hover:bg-accent-hover"
        >
          Buy credits
        </Link>
      </section>

      <section className={CARD}>
        <div className="mb-md flex items-center justify-between">
          <h2 className="font-headline-md text-headline-md text-on-surface">Recent activity</h2>
          <Link to="/billing" className="font-label-md text-label-md text-primary hover:text-accent-hover">
            View all
          </Link>
        </div>
        <HistoryList entries={recent} limitRows={6} />
      </section>
    </div>
  );
}
