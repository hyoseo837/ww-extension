import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SUPPORT_EMAIL } from "../../support";

// Auth-agnostic shell for the public legal pages (/privacy, /terms). Renders
// the same whether signed in or out — no app sidebar.
export default function LegalLayout({ title, children }: { title: string; children: ReactNode }) {
  const navigate = useNavigate();
  const goBack = () => (window.history.length > 1 ? navigate(-1) : navigate("/"));

  return (
    <div className="min-h-screen bg-page-bg">
      <header className="w-full border-b border-border px-gutter py-md">
        <div className="mx-auto flex max-w-[760px] items-center justify-between">
          <Link to="/" className="font-headline-md text-headline-md font-semibold tracking-tight text-primary">
            WW Scorer
          </Link>
          <button
            onClick={goBack}
            className="font-label-md text-label-md text-text-secondary transition-colors hover:text-primary"
          >
            ← Back
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-gutter py-xl">
        <h1 className="mb-lg font-display-lg-mobile text-display-lg-mobile text-on-surface md:font-display-lg md:text-display-lg">
          {title}
        </h1>

        <div
          className="flex flex-col gap-md font-body-md text-body-md leading-relaxed text-text-secondary
            [&_h2]:mb-xs [&_h2]:mt-lg [&_h2]:font-headline-md [&_h2]:text-headline-md [&_h2]:text-on-surface
            [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-xs [&_ul]:pl-lg
            [&_a]:text-primary [&_a]:underline
            [&_strong]:font-semibold [&_strong]:text-on-surface"
        >
          {children}
        </div>

        <footer className="mt-xxl border-t border-border pt-lg font-label-sm text-label-sm text-text-muted">
          Questions?{" "}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="text-primary underline">
            {SUPPORT_EMAIL}
          </a>
        </footer>
      </main>
    </div>
  );
}
