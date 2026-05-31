import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api";
import { useDashboard } from "../Layout";
import { fmtCredits, kindLabel } from "../format";

type Entry = { id: string; created_at: string; kind: string; delta: number; ref: string | null };

export default function Account() {
  const { balance } = useDashboard();
  const [recent, setRecent] = useState<Entry[]>([]);

  useEffect(() => {
    apiGet<{ entries: Entry[] }>("/credits/history?limit=5")
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
        {recent.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          recent.map((e) => (
            <div className="row" key={e.id}>
              <div>
                <div>{kindLabel(e.kind)}</div>
                <div className="muted small">
                  {new Date(e.created_at).toLocaleDateString()}
                </div>
              </div>
              <span className={e.delta >= 0 ? "amount-pos" : "amount-neg"}>
                {fmtCredits(e.delta)}
              </span>
            </div>
          ))
        )}
        <p style={{ marginBottom: 0 }}>
          <Link to="/billing">View all →</Link>
        </p>
      </div>
    </div>
  );
}
