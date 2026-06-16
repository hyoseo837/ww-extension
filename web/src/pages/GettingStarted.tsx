import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Icon from "../Icon";
import { CHROME_STORE_URL, WW_JOBS_URL } from "../links";

const CARD = "rounded-xl border border-border bg-surface p-lg shadow-[0_2px_8px_rgba(0,0,0,0.02)]";
const BTN =
  "inline-flex items-center gap-xs self-start rounded-lg bg-primary px-[20px] py-sm font-label-md text-label-md text-on-primary transition-colors hover:bg-accent-hover";

function Step({
  n,
  title,
  children,
  action,
}: {
  n: number;
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className={`${CARD} flex flex-col gap-md`}>
      <div className="flex items-center gap-sm">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary font-label-md text-label-md text-on-primary">
          {n}
        </span>
        <h2 className="font-headline-md text-headline-md text-on-surface">{title}</h2>
      </div>
      <div className="font-body-md text-body-md text-text-secondary [&_a]:text-primary [&_a]:underline">{children}</div>
      {action}
    </div>
  );
}

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div className="border-b border-border py-md last:border-0">
      <h3 className="mb-xs font-label-md text-label-md text-on-surface">{q}</h3>
      <p className="font-body-md text-body-md text-text-secondary [&_a]:text-primary [&_a]:underline">{children}</p>
    </div>
  );
}

export default function GettingStarted() {
  return (
    <div className="mx-auto max-w-max-width space-y-xxl p-gutter lg:p-xxl">
      <section className="mt-md">
        <h1 className="mb-xs font-display-lg-mobile text-display-lg-mobile text-on-surface md:font-display-lg md:text-display-lg">
          Getting started
        </h1>
        <p className="font-body-lg text-body-lg text-text-secondary">
          Three steps from sign-up to a fully scored job list.
        </p>
      </section>

      <section className="space-y-lg">
        <Step
          n={1}
          title="Install the Chrome extension"
          action={
            <a href={CHROME_STORE_URL} target="_blank" rel="noopener noreferrer" className={BTN}>
              <Icon name="extension" className="text-[18px]" />
              Get the extension
            </a>
          }
        >
          One click from the Chrome Web Store — no API keys, nothing to configure. It adds an{" "}
          <strong>AI Score</strong> panel to the WaterlooWorks jobs page.
        </Step>

        <Step
          n={2}
          title="Set up your profile"
          action={
            <Link to="/profile" className={BTN}>
              <Icon name="person" className="text-[18px]" />
              Set up profile
            </Link>
          }
        >
          Upload your WaterlooWorks application package (PDF) on the <Link to="/profile">Profile</Link> page — we
          extract your profile automatically. The short setup wizard captures what you're looking for; tweak it any
          time on <Link to="/preferences">Preferences</Link>.
        </Step>

        <Step
          n={3}
          title="Run your first scan"
          action={
            <a href={WW_JOBS_URL} target="_blank" rel="noopener noreferrer" className={BTN}>
              <Icon name="bolt" className="text-[18px]" />
              Open WaterlooWorks
            </a>
          }
        >
          On the WaterlooWorks jobs list, open the <strong>AI Score</strong> tab and hit{" "}
          <strong>Scan All Jobs</strong>. Every posting gets a 1–20 score and a verdict — filter, sort, and bulk-save
          the best ones to a folder.
        </Step>
      </section>

      <section className={CARD}>
        <h2 className="mb-sm font-headline-md text-headline-md text-on-surface">FAQ</h2>
        <Faq q="How much does it cost?">
          New accounts get <strong>200 free credits</strong> (≈ 100 scans). Each scan costs about 2 credits (1 credit = $0.01 CAD). Top
          up any time from <Link to="/buy">Buy credits</Link>; bigger packs include bonus credits.
        </Faq>
        <Faq q="What counts as a scan?">
          One posting scored is about 2 credits. Postings you've already scored aren't charged again.
        </Faq>
        <Faq q="Do I need my own API key?">
          No. Scoring runs on our backend — there's nothing to set up beyond signing in.
        </Faq>
        <Faq q="Is my data private?">
          Your profile is tied to your account and sent to Google Gemini only to score jobs. You can export or delete all
          your data anytime from the <Link to="/account">Dashboard</Link>. See our <Link to="/privacy">Privacy Policy</Link>.
        </Faq>
      </section>
    </div>
  );
}
