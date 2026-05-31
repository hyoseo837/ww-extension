import { useState } from "react";
import { apiPost } from "../api";

// Mirrors payments.py CREDIT_PACKAGES (strictly 1 credit = $0.01 CAD).
const PACKAGES = [
  { id: "credits_500", credits: 500, price: "$5" },
  { id: "credits_1000", credits: 1000, price: "$10", popular: true },
  { id: "credits_2000", credits: 2000, price: "$20" },
];

export default function Buy() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(id: string) {
    setBusy(id);
    setError(null);
    try {
      const { url } = await apiPost<{ url: string }>("/credits/checkout", {
        package_id: id,
        client: "web",
      });
      window.location.href = url;
    } catch (e) {
      setError(String(e));
      setBusy(null);
    }
  }

  return (
    <div className="container">
      <h1 className="page-title">Top up your credits</h1>
      {error && <p className="error">Could not start checkout: {error}</p>}

      <div className="packages">
        {PACKAGES.map((p) => (
          <div className={`card package${p.popular ? " popular" : ""}`} key={p.id}>
            {p.popular && <span className="badge">Most popular</span>}
            <div className="credits">{p.credits.toLocaleString()}</div>
            <div className="muted">credits</div>
            <div className="price">{p.price} CAD</div>
            <button
              className="btn btn-primary"
              disabled={busy !== null}
              onClick={() => buy(p.id)}
            >
              {busy === p.id ? "Redirecting…" : "Buy"}
            </button>
          </div>
        ))}
      </div>

      <p className="muted small">Secure checkout via Stripe.</p>
    </div>
  );
}
