import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { useDashboard } from "../Layout";
import HistoryList, { type Entry } from "../HistoryList";

export default function Account() {
  const { balance } = useDashboard();
  const [recent, setRecent] = useState<Entry[]>([]);

  useEffect(() => {
    // Fetch a window wide enough that a batch isn't truncated, then show the
    // first few grouped rows.
    apiGet<{ entries: Entry[] }>("/credits/history?limit=25")
      .then((d) => setRecent(d.entries))
      .catch(() => setRecent([]));
  }, []);

  return (
    <div className="container">
      <h1 className="page-title">Your account</h1>

      <div className="card">
        <div className="balance-num">{balance === null ? "…" : balance}</div>
        <p className="balance-label">credits available</p>
        <p className="muted small">1 credit ≈ $0.01 CAD</p>
        <Link className="btn btn-primary" to="/buy">Buy credits</Link>
      </div>

      <div className="card">
        <h2>Recent activity</h2>
        <HistoryList entries={recent} limitRows={6} />
        <p style={{ marginBottom: 0, marginTop: 12 }}>
          <Link to="/billing">View all →</Link>
        </p>
      </div>
    </div>
  );
}
