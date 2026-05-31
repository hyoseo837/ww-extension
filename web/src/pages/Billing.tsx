import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { apiGet } from "../api";
import { useDashboard } from "../Layout";
import HistoryList, { type Entry } from "../HistoryList";

const PAGE = 25;

export default function Billing() {
  const { refetchBalance } = useDashboard();
  const [params] = useSearchParams();
  const justPaid = params.get("checkout") === "success";

  const [entries, setEntries] = useState<Entry[]>([]);
  const [done, setDone] = useState(false);

  // reset=true reloads from the top; otherwise appends the next page.
  const load = useCallback(async (reset: boolean) => {
    const offset = reset ? 0 : entries.length;
    const d = await apiGet<{ entries: Entry[] }>(
      `/credits/history?limit=${PAGE}&offset=${offset}`,
    );
    setEntries((prev) => (reset ? d.entries : [...prev, ...d.entries]));
    setDone(d.entries.length < PAGE);
  }, [entries.length]);

  useEffect(() => {
    load(true).catch(() => setDone(true));
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The webhook credit grant lands a few seconds after the Stripe redirect,
  // so refresh balance + history shortly after returning from checkout.
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
    <div className="container">
      <h1 className="page-title">Billing</h1>

      {justPaid && (
        <div className="banner">
          Payment received — your balance updates within a few seconds.
        </div>
      )}

      <div className="card">
        <h2>Credit history</h2>
        <HistoryList entries={entries} />
        {!done && entries.length > 0 && (
          <p style={{ marginBottom: 0, marginTop: 16 }}>
            <button className="btn" onClick={() => load(false).catch(() => setDone(true))}>
              Load more
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
