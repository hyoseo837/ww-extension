import { useState } from "react";
import { apiPost } from "../api";
import { PACKAGES } from "../packages";
import Icon from "../Icon";

export default function Buy() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(id: string) {
    setBusy(id);
    setError(null);
    try {
      const { url } = await apiPost<{ url: string }>("/credits/checkout", { package_id: id, client: "web" });
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
          Credits pay for AI scans. 1 credit = $0.01 CAD.
        </p>
      </header>

      {error && <p className="text-center font-body-md text-body-md text-negative">Could not start checkout: {error}</p>}

      <section className="grid grid-cols-1 gap-lg md:grid-cols-3">
        {PACKAGES.map((p) => {
          const highlighted = !!p.popular;
          return (
            <article
              key={p.id}
              className={[
                "relative flex flex-col gap-lg rounded-xl bg-surface p-lg transition-transform duration-300 hover:-translate-y-1",
                highlighted
                  ? "border border-primary shadow-[0_8px_24px_rgba(143,72,48,0.08)] md:scale-105"
                  : "border border-border shadow-[0_2px_8px_rgba(0,0,0,0.02)]",
              ].join(" ")}
            >
              {highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-accent-soft px-md py-base font-label-sm text-label-sm text-primary">
                  Most popular
                </div>
              )}
              <div className="flex flex-col gap-xs pt-sm">
                <h2 className={`font-headline-lg text-headline-lg ${highlighted ? "text-primary" : "text-on-surface"}`}>
                  {p.credits.toLocaleString()}
                </h2>
                <span className="font-label-md text-label-md uppercase tracking-wider text-text-muted">Credits</span>
              </div>
              <div className="flex items-baseline gap-xs">
                <span className="font-headline-md text-headline-md text-on-surface">{p.price}</span>
                <span className="font-body-md text-body-md text-text-secondary">CAD</span>
              </div>
              <p className="border-b border-border pb-md font-body-md text-body-md text-text-secondary">{p.note}</p>
              <button
                onClick={() => buy(p.id)}
                disabled={busy !== null}
                className={[
                  "mt-auto w-full rounded-lg px-lg py-sm font-label-md text-label-md transition-colors disabled:opacity-60",
                  highlighted
                    ? "bg-primary text-on-primary hover:bg-accent-hover shadow-[0_2px_8px_rgba(143,72,48,0.2)]"
                    : "border border-border bg-surface text-primary hover:bg-surface-alt",
                ].join(" ")}
              >
                {busy === p.id ? "Redirecting…" : `Buy ${p.credits.toLocaleString()} credits`}
              </button>
            </article>
          );
        })}
      </section>

      <div className="mt-lg flex items-center justify-center gap-xs text-text-muted">
        <Icon name="lock" className="text-[18px]" />
        <span className="font-label-sm text-label-sm">Secure checkout via Stripe</span>
      </div>
    </div>
  );
}
