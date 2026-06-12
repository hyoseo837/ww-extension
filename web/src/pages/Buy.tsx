import { useState } from "react";
import { apiPost } from "../api";
import { PACKAGES } from "../packages";
import PackageCard from "../PackageCard";
import Icon from "../Icon";

export default function Buy() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(id: string) {
    setBusy(id);
    setError(null);
    try {
      const { url } = await apiPost<{ url: string }>("/credits/checkout", { package_id: id });
      window.location.href = url;
    } catch (e) {
      setError(String(e));
      setBusy(null);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-max-width flex-col gap-xxl px-gutter py-xl">
      <header className="mt-lg flex flex-col items-center gap-sm text-center">
        <h1 className="font-display-lg text-display-lg text-on-surface">Top up your credits</h1>
        <p className="max-w-2xl font-body-lg text-body-lg text-text-secondary">
          1 scan ≈ 2 credits.
        </p>
      </header>

      {error && <p className="text-center font-body-md text-body-md text-negative">Could not start checkout: {error}</p>}

      <section className="grid grid-cols-1 gap-lg md:grid-cols-3">
        {PACKAGES.map((p) => (
          <PackageCard
            key={p.id}
            pkg={p}
            hover
            ctaLabel={busy === p.id ? "Redirecting…" : "Buy"}
            ctaDisabled={busy !== null}
            onCta={() => buy(p.id)}
          />
        ))}
      </section>

      <div className="mt-lg flex items-center justify-center gap-xs text-text-muted">
        <Icon name="lock" className="text-[18px]" />
        <span className="font-label-sm text-label-sm">Secure checkout via Stripe</span>
      </div>

      {/* Referral blurb (v8.12, ADR 0050) — the free alternative to buying. */}
      <section className="mx-auto flex w-full max-w-2xl items-start gap-md rounded-xl border border-border bg-surface p-lg shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-soft text-primary">
          <Icon name="group_add" />
        </div>
        <div>
          <h2 className="mb-xs font-headline-md text-headline-md text-on-surface">Or earn credits free — invite a friend</h2>
          <p className="font-body-md text-body-md text-text-secondary">
            When a friend runs their first scan, you get <strong>20 credits</strong> (≈ 10 scans). No links or
            codes — they just enter your email at the "Who invited you?" step during setup.
          </p>
        </div>
      </section>
    </div>
  );
}
