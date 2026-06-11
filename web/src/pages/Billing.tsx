import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet } from "../api";
import { useDashboard } from "../Layout";
import HistoryList, { type Entry } from "../HistoryList";
import { fmtBalance } from "../format";

const CARD = "rounded-xl border border-border bg-surface p-lg shadow-[0_2px_8px_rgba(41,38,31,0.04)]";
// One scan batch easily exceeds 25 ledger items, so 25 made the first view
// feel truncated; 100 is the server-side cap (billing/routes.py).
const PAGE = 100;

export default function Billing() {
  const { balance, refetchBalance } = useDashboard();
  const [params] = useSearchParams();
  const justPaid = params.get("checkout") === "success";

  const [entries, setEntries] = useState<Entry[]>([]);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async (reset: boolean) => {
    const offset = reset ? 0 : entries.length;
    const d = await apiGet<{ entries: Entry[] }>(`/credits/history?limit=${PAGE}&offset=${offset}`);
    setEntries((prev) => (reset ? d.entries : [...prev, ...d.entries]));
    setDone(d.entries.length < PAGE);
  }, [entries.length]);

  useEffect(() => {
    load(true)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!justPaid) return;
    const refresh = () => {
      refetchBalance();
      load(true).catch(() => {});
    };
    const t1 = setTimeout(refresh, 2500);
    const t2 = setTimeout(refresh, 6000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [justPaid]);

  return (
    <div className="mx-auto flex w-full max-w-max-width flex-col gap-xl px-gutter py-xl">
      <h1 className="font-display-lg text-display-lg text-on-surface">Billing</h1>

      {justPaid && (
        <div className="rounded-lg bg-accent-soft px-md py-sm font-body-md text-body-md text-primary">
          Payment received — your balance updates within a few seconds.
        </div>
      )}

      <section className={`${CARD} flex flex-col gap-sm`}>
        <div className="font-headline-lg text-headline-lg text-on-surface">
          {balance === null ? "…" : fmtBalance(balance)}
        </div>
        <span className="font-body-md text-body-md text-text-secondary">credits available</span>
        <span className="font-label-sm text-label-sm text-text-muted">1 credit = $0.01 CAD</span>
        <Link
          to="/buy"
          className="mt-sm self-start rounded-lg bg-primary px-lg py-sm font-label-md text-label-md text-on-primary transition-colors hover:bg-accent-hover"
        >
          Buy credits
        </Link>
      </section>

      <section className={CARD}>
        <h2 className="mb-md font-headline-md text-headline-md text-on-surface">Credit history</h2>
        {loading ? (
          <p className="font-body-md text-body-md text-text-muted">Loading…</p>
        ) : error ? (
          <p className="font-body-md text-body-md text-negative">Couldn't load your credit history. Refresh to try again.</p>
        ) : (
          <>
            <HistoryList entries={entries} />
            {!done && entries.length > 0 && (
              <div className="mt-lg flex justify-center">
                <button
                  onClick={() => load(false).catch(() => setDone(true))}
                  className="rounded-lg border border-border px-lg py-sm font-label-md text-label-md text-primary transition-colors hover:bg-surface-alt"
                >
                  Load more
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
