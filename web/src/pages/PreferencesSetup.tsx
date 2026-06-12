import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiPost, apiPut } from "../api";
import { ChipSelect, ChipToggle, TagInput, TERM_LENGTHS, WORK_MODES } from "../criteria-inputs";
import Icon from "../Icon";
import { coerceCriteria, emptyMatchCriteria, upcomingTerms } from "../types";
import type { MatchCriteria, Profile, WorkAuth } from "../types";

// First-run preferences wizard (v8.4, ADR 0040; criteria v2 per ADR 0041).
// Renders outside the app shell; the shell gate redirects here until it's
// completed. One question per step, everything but work authorization
// skippable. Facts only — importance is captured in the user's own words on
// the final step. Writes the same match_criteria jsonb as /preferences.

const WORK_AUTH: { value: Exclude<WorkAuth, null>; label: string; hint: string }[] = [
  { value: "citizen", label: "Canadian citizen", hint: "Eligible for any posting" },
  { value: "pr", label: "Permanent resident", hint: "Eligible for most postings" },
  { value: "international", label: "International (study permit)", hint: "Some postings require citizenship/PR — we'll flag those" },
  { value: "other", label: "Other / not sure", hint: "We'll be conservative about eligibility flags" },
];

const STEPS = ["Eligibility", "Locations", "Work mode", "Timing", "In your own words"];
const REFERRAL_STEP = "Who invited you?";

export default function PreferencesSetup() {
  const navigate = useNavigate();
  const [mc, setMc] = useState<MatchCriteria>(emptyMatchCriteria());
  const [notes, setNotes] = useState("");
  const [step, setStep] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Referral step (v8.12, ADR 0050) — shown only while the server says the
  // question is still answerable (no attribution, no scans, not blocked).
  const [referralEligible, setReferralEligible] = useState(false);
  const [referralEmail, setReferralEmail] = useState("");
  const [referralError, setReferralError] = useState<string | null>(null);

  // Prefill so re-running the wizard edits rather than clobbers.
  useEffect(() => {
    apiGet<Profile>("/profile")
      .then((p) => {
        setMc(coerceCriteria(p.match_criteria));
        setNotes(p.preferences || "");
      })
      .catch(() => {}) // empty defaults are a fine starting point
      .finally(() => setLoaded(true));
    apiGet<{ referral_eligible: boolean }>("/me")
      .then((m) => setReferralEligible(!!m.referral_eligible))
      .catch(() => {}); // no referral step is a fine fallback
  }, []);

  const steps = referralEligible ? [...STEPS, REFERRAL_STEP] : STEPS;

  async function finish() {
    setSaving(true);
    setError(null);
    setReferralError(null);
    // The referral answer is validated first so a typo'd email can be fixed
    // before anything saves; preferences are unaffected by its outcome.
    if (referralEligible && referralEmail.trim()) {
      try {
        await apiPost("/referral", { inviter_email: referralEmail.trim() });
      } catch (e) {
        if (String(e).includes("404")) {
          setReferralError("No account with that email — fix it, or leave it blank to skip.");
          setSaving(false);
          return;
        }
        if (String(e).includes("400")) {
          setReferralError("That's your own email — enter the friend who invited you, or leave it blank.");
          setSaving(false);
          return;
        }
        // Anything else (already set, not eligible, transient) never blocks
        // finishing the wizard.
      }
    }
    try {
      await apiPut<Profile>("/profile", {
        match_criteria: { ...mc, wizard_completed_at: new Date().toISOString() },
        preferences: notes,
      });
      navigate("/account");
    } catch (e) {
      setError(`Could not save: ${e}`);
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-bright">
        <p className="font-body-md text-body-md text-text-muted">Loading…</p>
      </div>
    );
  }

  const last = step === steps.length - 1;
  const canNext = step !== 0 || mc.work_authorization !== null;
  // Whether the current step has any input — flips the button label Skip/Next.
  const stepHasInput = [
    mc.work_authorization !== null,
    mc.locations.length > 0,
    mc.work_modes.length > 0,
    mc.target_term.trim().length > 0 || mc.term_lengths.length > 0,
    notes.trim().length > 0,
    referralEmail.trim().length > 0,
  ][step];

  return (
    <div className="flex min-h-screen flex-col items-center bg-surface-bright px-gutter py-xl">
      <div className="flex w-full max-w-[560px] flex-1 flex-col gap-lg">
        <header className="flex flex-col gap-xs">
          <div className="flex items-center gap-xs">
            <Icon name="tune" className="text-[20px] text-primary" />
            <span className="font-label-md text-label-md text-text-secondary">Set up your match preferences</span>
          </div>
          <div className="flex items-center gap-xs">
            {steps.map((s, i) => (
              <span key={s} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-surface-container"}`} />
            ))}
          </div>
          <span className="font-label-sm text-label-sm text-text-muted">
            Step {step + 1} of {steps.length} — {steps[step]}
          </span>
        </header>

        <main className="flex flex-col gap-md rounded-xl border border-border bg-surface p-lg">
          {step === 0 && (
            <>
              <h1 className="font-headline-md text-headline-md text-on-surface">What's your work status in Canada?</h1>
              <p className="font-body-md text-body-md text-text-secondary">
                Some postings require citizenship or permanent residency. This lets the scorer flag jobs you aren't eligible for.
              </p>
              <div className="flex flex-col gap-sm">
                {WORK_AUTH.map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => setMc((prev) => ({ ...prev, work_authorization: o.value }))}
                    className={`flex flex-col items-start rounded-lg border px-md py-sm text-left transition-colors ${
                      mc.work_authorization === o.value ? "border-primary bg-accent-soft" : "border-border bg-surface hover:border-primary"
                    }`}
                  >
                    <span className="font-label-md text-label-md text-on-surface">{o.label}</span>
                    <span className="font-label-sm text-label-sm text-text-muted">{o.hint}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <h1 className="font-headline-md text-headline-md text-on-surface">Where do you want to work?</h1>
              <p className="font-body-md text-body-md text-text-secondary">
                Add cities or regions — press Enter after each. Leave empty if you're open to anywhere.
              </p>
              <TagInput
                values={mc.locations}
                onChange={(v) => setMc((prev) => ({ ...prev, locations: v }))}
                placeholder="e.g. Toronto, Vancouver, West Canada"
              />
            </>
          )}

          {step === 2 && (
            <>
              <h1 className="font-headline-md text-headline-md text-on-surface">How do you want to work?</h1>
              <p className="font-body-md text-body-md text-text-secondary">Pick any that suit you.</p>
              <ChipToggle
                options={WORK_MODES}
                selected={mc.work_modes}
                onChange={(v) => setMc((prev) => ({ ...prev, work_modes: v }))}
              />
            </>
          )}

          {step === 3 && (
            <>
              <h1 className="font-headline-md text-headline-md text-on-surface">When, and for how long?</h1>
              <p className="font-body-md text-body-md text-text-secondary">
                Which work term are you targeting, and what term length works for you?
              </p>
              <div className="flex flex-col gap-xs">
                <span className="font-label-sm text-label-sm text-text-muted">Target term</span>
                <ChipSelect
                  options={upcomingTerms()}
                  value={mc.target_term}
                  onChange={(v) => setMc((prev) => ({ ...prev, target_term: v }))}
                />
              </div>
              <div className="flex flex-col gap-xs">
                <span className="font-label-sm text-label-sm text-text-muted">Term length</span>
                <ChipToggle
                  options={TERM_LENGTHS}
                  selected={mc.term_lengths}
                  onChange={(v) => setMc((prev) => ({ ...prev, term_lengths: v }))}
                />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h1 className="font-headline-md text-headline-md text-on-surface">In your own words — what matters most?</h1>
              <p className="font-body-md text-body-md text-text-secondary">
                The scorer reads this literally: "non-negotiable" dominates, "would be nice" nudges, "never" rules
                postings out. This is where dealbreakers and emphasis live.
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={5}
                placeholder="e.g. Remote is non-negotiable. I'd love a startup but it's not a dealbreaker. Never pure QA."
                className="rounded-lg border border-border bg-surface px-sm py-sm font-body-md text-body-md outline-none focus:border-primary"
              />
            </>
          )}

          {steps[step] === REFERRAL_STEP && (
            <>
              <h1 className="font-headline-md text-headline-md text-on-surface">Did a friend invite you?</h1>
              <p className="font-body-md text-body-md text-text-secondary">
                Enter their UWaterloo email and they'll get 20 bonus credits when you run your first scan.
                Totally optional — leave it blank if you found us yourself.
              </p>
              <input
                type="email"
                value={referralEmail}
                onChange={(e) => {
                  setReferralEmail(e.target.value);
                  setReferralError(null);
                }}
                placeholder="friend@uwaterloo.ca"
                className="rounded-lg border border-border bg-surface px-sm py-sm font-body-md text-body-md outline-none focus:border-primary"
              />
              {referralError && <p className="font-label-sm text-label-sm text-negative">{referralError}</p>}
            </>
          )}

          {error && <p className="font-label-sm text-label-sm text-negative">{error}</p>}
        </main>

        <footer className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            disabled={step === 0}
            className="font-label-md text-label-md text-text-secondary transition-colors hover:text-primary disabled:invisible"
          >
            ← Back
          </button>
          <button
            type="button"
            onClick={() => (last ? finish() : setStep((s) => s + 1))}
            disabled={!canNext || saving}
            className="rounded-lg bg-primary px-lg py-sm font-label-md text-label-md text-on-primary transition-colors hover:bg-accent-hover disabled:opacity-60"
          >
            {saving ? "Saving…" : last ? "Finish" : stepHasInput ? "Next →" : "Skip →"}
          </button>
        </footer>

        <p className="text-center font-label-sm text-label-sm text-text-muted">
          You can change all of this later under Preferences.
        </p>
      </div>
    </div>
  );
}
