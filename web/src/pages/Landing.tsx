import { Link } from "react-router-dom";
import { signInWithMicrosoft } from "../supabase";
import { SUPPORT_EMAIL } from "../support";
import { CHROME_STORE_URL } from "../links";
import { PACKAGES } from "../packages";
import PackageCard from "../PackageCard";
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

const STEPS = [
  {
    icon: "extension",
    title: "Install the extension",
    body: "Add WW Scorer to Chrome from the Web Store — one click, no API keys, no setup.",
  },
  {
    icon: "person",
    title: "Set up your profile",
    body: "Upload your WaterlooWorks application package and set your match criteria, so scoring reflects you.",
  },
  {
    icon: "bolt",
    title: "Scan on WaterlooWorks",
    body: "Open the jobs list, hit Scan All Jobs, and every posting gets a 1–20 score and a verdict.",
  },
];

function MicrosoftMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5 rounded-[2px] bg-white p-[2px]">
      <path d="M3 3h8.5v8.5H3z" fill="#F25022" />
      <path d="M12.5 3H21v8.5h-8.5z" fill="#7FBA00" />
      <path d="M3 12.5h8.5V21H3z" fill="#00A4EF" />
      <path d="M12.5 12.5H21V21h-8.5z" fill="#FFB900" />
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
            onClick={() => signInWithMicrosoft()}
            className="flex items-center gap-sm rounded-[10px] bg-primary px-[24px] py-[14px] font-label-md text-label-md text-on-primary shadow-sm transition-colors hover:bg-accent-hover"
          >
            <MicrosoftMark />
            Sign in with your UWaterloo account
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

        {/* How it works — the three steps to first value, before the pricing
            ask. Static (no auth state); mirrors the dashboard checklist. */}
        <section className="mx-auto w-full max-w-max-width px-gutter pb-[120px]">
          <div className="mb-xl flex flex-col items-center gap-sm text-center">
            <h2 className="font-display-lg-mobile text-display-lg-mobile text-on-surface md:font-display-lg md:text-display-lg">
              How it works
            </h2>
            <p className="max-w-[600px] font-body-lg text-body-lg text-text-secondary">
              Three steps from sign-up to a fully scored job list.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-lg md:grid-cols-3">
            {STEPS.map((s, i) => (
              <div key={s.title} className="flex flex-col items-start rounded-[16px] border border-border bg-surface p-lg">
                <div className="mb-md flex items-center gap-sm">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary font-label-md text-label-md text-on-primary">
                    {i + 1}
                  </span>
                  <Icon name={s.icon} className="text-primary" />
                </div>
                <h3 className="mb-xs font-headline-md text-headline-md text-on-surface">{s.title}</h3>
                <p className="font-body-md text-body-md text-text-secondary">{s.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Referral banner (v8.12, ADR 0050) — speaks to both audiences:
            existing users learn the program exists; invited visitors learn
            what the "Who invited you?" setup step is for. */}
        <section className="mx-auto w-full max-w-max-width px-gutter pb-[120px]">
          <div className="flex flex-col items-center gap-md rounded-[16px] border border-primary/30 bg-accent-soft p-xl text-center md:flex-row md:text-left">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface text-primary">
              <Icon name="group_add" className="text-[28px]" />
            </div>
            <div className="flex-1">
              <h2 className="mb-xs font-headline-md text-headline-md text-on-surface">
                Better with friends — invite and earn free scans
              </h2>
              <p className="font-body-md text-body-md text-text-secondary">
                Every friend who signs up and runs their first scan earns you <strong>20 credits</strong> — about 10
                free scans. No links or codes: they just enter your email at the "Who invited you?" step during
                setup. Invited by someone? Don't forget to enter their email.
              </p>
            </div>
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
              Credits power AI scans — about 2 credits per scan, no subscription. Bigger packs include bonus credits.
            </p>
          </div>
          <div className="grid grid-cols-1 gap-lg md:grid-cols-3">
            {PACKAGES.map((p) => (
              <PackageCard key={p.id} pkg={p} ctaLabel="Sign in to buy" onCta={() => signInWithMicrosoft()} />
            ))}
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
