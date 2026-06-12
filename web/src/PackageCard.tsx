import type { CreditPackage } from "./packages";

// One credit-package pricing card (v8.13) — shared by the logged-out landing
// and /buy, which differ only in the CTA. `hover` adds /buy's lift-on-hover.
export default function PackageCard({ pkg, ctaLabel, onCta, ctaDisabled = false, hover = false }: {
  pkg: CreditPackage;
  ctaLabel: string;
  onCta: () => void;
  ctaDisabled?: boolean;
  hover?: boolean;
}) {
  const highlighted = !!pkg.popular;
  return (
    <article
      className={[
        "relative flex flex-col gap-lg rounded-xl bg-surface p-lg",
        hover ? "transition-transform duration-300 hover:-translate-y-1" : "",
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
        <h3 className={`font-headline-lg text-headline-lg ${highlighted ? "text-primary" : "text-on-surface"}`}>
          {pkg.credits.toLocaleString()}
          <span className="ml-xs font-body-md text-body-md text-text-muted">credits</span>
        </h3>
        <span className="font-label-sm text-label-sm text-text-muted">{pkg.note}</span>
      </div>
      <div className="flex items-baseline gap-xs">
        <span className="font-headline-md text-headline-md text-on-surface">{pkg.price}</span>
        <span className="font-body-md text-body-md text-text-secondary">CAD</span>
      </div>
      <button
        onClick={onCta}
        disabled={ctaDisabled}
        className={[
          "mt-auto w-full rounded-lg px-lg py-sm font-label-md text-label-md transition-colors disabled:opacity-60",
          highlighted
            ? "bg-primary text-on-primary hover:bg-accent-hover shadow-[0_2px_8px_rgba(143,72,48,0.2)]"
            : "border border-border bg-surface text-primary hover:bg-surface-alt",
        ].join(" ")}
      >
        {ctaLabel}
      </button>
    </article>
  );
}
