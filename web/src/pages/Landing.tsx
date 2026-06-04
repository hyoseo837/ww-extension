import { Link } from "react-router-dom";
import { signInWithGoogle } from "../supabase";
import { SUPPORT_EMAIL } from "../support";
import { CHROME_STORE_URL } from "../links";
import { PACKAGES } from "../packages";
import Icon from "../Icon";

const FEATURES = [
  {
    icon: "psychiatry",
    title: "Smart scoring",
    body: "Goes beyond basic keyword matching. The AI reads between the lines to deeply understand role requirements and your actual capabilities.",
  },
  {
    icon: "tune",
    title: "Your profile, your criteria",
    body: "Prioritize salary, remote work, specific tech stacks, or company culture. Tailor the scoring algorithm to your exact preferences.",
  },
  {
    icon: "payments",
    title: "Pay only for what you scan",
    body: "A flexible, transparent credit system ensures you only spend money analyzing the specific job postings you are genuinely interested in.",
  },
];

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 rounded-full bg-white p-[2px]">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-page-bg">
      <header className="w-full px-gutter pb-md pt-lg">
        <div className="mx-auto max-w-max-width">
          <span className="font-headline-md text-headline-md font-semibold tracking-tight text-primary">WW Scorer</span>
        </div>
      </header>

      <main className="flex w-full flex-grow flex-col justify-center">
        {/* Hero */}
        <section className="mx-auto flex max-w-max-width flex-col items-center px-gutter py-[80px] text-center md:py-[120px]">
          <div className="mb-lg inline-flex items-center gap-xs rounded-full bg-accent-soft px-sm py-xs font-label-sm text-label-sm text-primary">
            <Icon name="auto_awesome" className="text-[16px]" />
            <span>AI-Powered Matching</span>
          </div>
          <h1 className="mb-md max-w-[800px] font-display-lg-mobile text-display-lg-mobile text-on-surface md:font-display-lg md:text-display-lg">
            Score your WaterlooWorks co-op postings with AI
          </h1>
          <p className="mb-xl max-w-[600px] font-body-lg text-body-lg text-text-secondary">
            Upload your resume, set your specific career criteria, and let intelligent evaluation rank every job
            posting to find your perfect match.
          </p>
          <button
            onClick={() => signInWithGoogle()}
            className="flex items-center gap-sm rounded-[10px] bg-primary px-[24px] py-[14px] font-label-md text-label-md text-on-primary shadow-sm transition-colors hover:bg-accent-hover"
          >
            <GoogleMark />
            Sign in with Google
          </button>
          <a
            href={CHROME_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-sm flex items-center gap-sm rounded-[10px] border border-border bg-surface px-[24px] py-[14px] font-label-md text-label-md text-primary transition-colors hover:bg-surface-alt"
          >
            <Icon name="extension" className="text-[18px]" />
            Add to Chrome — it's free
          </a>
          <p className="mt-md max-w-[420px] font-label-sm text-label-sm text-text-muted">
            By continuing, you agree to our{" "}
            <Link to="/terms" className="underline transition-colors hover:text-text-secondary">Terms</Link> and{" "}
            <Link to="/privacy" className="underline transition-colors hover:text-text-secondary">Privacy Policy</Link>.
          </p>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-max-width px-gutter pb-[120px]">
          <div className="grid grid-cols-1 gap-lg md:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="flex flex-col items-start rounded-[16px] border border-border bg-surface p-lg">
                <div className="mb-md flex h-12 w-12 items-center justify-center rounded-full bg-surface-container text-primary">
                  <Icon name={f.icon} />
                </div>
                <h3 className="mb-xs font-headline-md text-headline-md text-on-surface">{f.title}</h3>
                <p className="font-body-md text-body-md text-text-secondary">{f.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Pricing — visible before sign-in. Display-only: buying needs an
            authenticated session, so the CTA is sign-in, not checkout. */}
        <section className="mx-auto w-full max-w-max-width px-gutter pb-[120px]">
          <div className="mb-xl flex flex-col items-center gap-sm text-center">
            <h2 className="font-display-lg-mobile text-display-lg-mobile text-on-surface md:font-display-lg md:text-display-lg">
              Pay only for what you scan
            </h2>
            <p className="max-w-[600px] font-body-lg text-body-lg text-text-secondary">
              Credits power AI scans — about 1 credit per scan, no subscription. Bigger packs include bonus credits.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-lg md:grid-cols-3">
            {PACKAGES.map((p) => {
              const highlighted = !!p.popular;
              return (
                <article
                  key={p.id}
                  className={[
                    "relative flex flex-col gap-lg rounded-xl bg-surface p-lg",
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
                      {p.credits.toLocaleString()}
                    </h3>
                    <span className="font-label-md text-label-md uppercase tracking-wider text-text-muted">Credits</span>
                  </div>
                  <div className="flex items-baseline gap-xs">
                    <span className="font-headline-md text-headline-md text-on-surface">{p.price}</span>
                    <span className="font-body-md text-body-md text-text-secondary">CAD</span>
                  </div>
                  <p className="border-b border-border pb-md font-body-md text-body-md text-text-secondary">{p.note}</p>
                  <button
                    onClick={() => signInWithGoogle()}
                    className={[
                      "mt-auto w-full rounded-lg px-lg py-sm font-label-md text-label-md transition-colors",
                      highlighted
                        ? "bg-primary text-on-primary hover:bg-accent-hover shadow-[0_2px_8px_rgba(143,72,48,0.2)]"
                        : "border border-border bg-surface text-primary hover:bg-surface-alt",
                    ].join(" ")}
                  >
                    Sign in to buy
                  </button>
                </article>
              );
            })}
          </div>
          <div className="mt-lg flex items-center justify-center gap-xs text-text-muted">
            <Icon name="lock" className="text-[18px]" />
            <span className="font-label-sm text-label-sm">Secure checkout via Stripe</span>
          </div>
        </section>
      </main>

      <footer className="mt-xxl w-full border-t border-border py-xl">
        <div className="mx-auto flex max-w-max-width flex-col gap-sm px-gutter">
          <div className="flex flex-col items-center justify-between gap-sm md:flex-row md:gap-0">
            <p className="font-label-sm text-label-sm text-text-muted">© 2026 WW Scorer. Built for Waterloo Students.</p>
            <div className="flex items-center gap-md">
              <Link to="/terms" className="font-label-sm text-label-sm text-text-muted transition-colors hover:text-text-secondary hover:underline">Terms</Link>
              <Link to="/privacy" className="font-label-sm text-label-sm text-text-muted transition-colors hover:text-text-secondary hover:underline">Privacy</Link>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="font-label-sm text-label-sm text-text-muted transition-colors hover:text-text-secondary hover:underline">Contact</a>
            </div>
          </div>
          <p className="text-center font-label-sm text-label-sm text-text-muted md:text-left">
            Not affiliated with, endorsed by, or connected to the University of Waterloo or WaterlooWorks.
          </p>
        </div>
      </footer>
    </div>
  );
}
