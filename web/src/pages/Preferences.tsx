import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiPut } from "../api";
import { emptyMatchCriteria } from "../types";
import type { MatchCriteria, Profile, WorkAuth } from "../types";

// Criteria v2 editor (v8.5, ADR 0041): concrete facts + one "in your own
// words" box. No weights, no tiers — the scorer infers importance from how
// the user phrases their notes.

const CARD = "rounded-xl border border-border bg-surface p-lg shadow-[0_2px_8px_rgba(41,38,31,0.04)]";
const INPUT = "rounded-lg border border-border bg-surface px-sm py-sm font-body-md text-body-md outline-none focus:border-primary";

const WORK_AUTH: { value: string; label: string }[] = [
  { value: "", label: "Unspecified" },
  { value: "citizen", label: "Canadian citizen" },
  { value: "pr", label: "Permanent resident" },
  { value: "international", label: "International (study permit)" },
  { value: "other", label: "Other" },
];

const WORK_MODES = ["Remote", "Hybrid", "On-site"];
const TERM_LENGTHS = ["4-month", "8-month"];

const CHIP_ON = "rounded-full bg-primary px-md py-xs font-label-md text-label-md text-on-primary";
const CHIP_OFF = "rounded-full border border-border bg-surface px-md py-xs font-label-md text-label-md text-text-secondary transition-colors hover:border-primary hover:text-primary";

function ChipToggle({ options, selected, onChange }: {
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
}) {
  const toggle = (o: string) =>
    onChange(selected.includes(o) ? selected.filter((x) => x !== o) : [...selected, o]);
  return (
    <div className="flex flex-wrap gap-sm">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => toggle(o)} className={selected.includes(o) ? CHIP_ON : CHIP_OFF}>
          {o}
        </button>
      ))}
    </div>
  );
}

// Type a value, Enter/comma/blur adds a removable chip.
function TagInput({ values, onChange, placeholder }: {
  values: string[];
  onChange: (v: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const v = draft.trim();
    if (v && !values.includes(v)) onChange([...values, v]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-xs">
      <input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            commit();
          }
        }}
        onBlur={commit}
        placeholder={placeholder}
        className={INPUT}
      />
      {values.length > 0 && (
        <div className="flex flex-wrap gap-xs">
          {values.map((v) => (
            <span key={v} className="flex items-center gap-base rounded-full bg-accent-soft px-sm py-base font-label-sm text-label-sm text-primary">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="leading-none text-primary/60 hover:text-primary">
                ×
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-base border-b border-border py-md last:border-0">
      <span className="font-label-md text-label-md text-on-surface">{label}</span>
      {children}
    </div>
  );
}

export default function Preferences() {
  const [mc, setMc] = useState<MatchCriteria>(emptyMatchCriteria());
  const [notes, setNotes] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Profile>("/profile")
      .then((p) => {
        setMc({ ...emptyMatchCriteria(), ...p.match_criteria });
        setNotes(p.preferences || "");
        setLoaded(true);
      })
      .catch((e) => setStatus(`Could not load preferences: ${e}`));
  }, []);

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      await apiPut<Profile>("/profile", { match_criteria: mc, preferences: notes });
      setStatus("Saved.");
    } catch (e) {
      setStatus(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) {
    return (
      <div className="mx-auto w-full max-w-max-width px-gutter py-xl">
        <p className="font-body-md text-body-md text-text-muted">{status ?? "Loading…"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-max-width flex-col gap-xl px-gutter py-xl pb-[96px]">
      <header className="flex flex-col gap-xs">
        <h1 className="font-display-lg text-display-lg text-on-surface">Match preferences</h1>
        <p className="font-body-lg text-body-lg text-text-secondary">
          The facts of what you're looking for, plus what matters most in your own words.
        </p>
        <Link to="/preferences/setup" className="self-start font-label-sm text-label-sm text-primary transition-colors hover:text-accent-hover">
          Re-run the setup wizard →
        </Link>
      </header>

      <section className={`${CARD} flex flex-col gap-sm`}>
        <h2 className="font-headline-md text-headline-md text-on-surface">Eligibility</h2>
        <label className="font-label-sm text-label-sm text-text-muted">Work authorization</label>
        <select
          value={mc.work_authorization ?? ""}
          onChange={(e) => setMc((prev) => ({ ...prev, work_authorization: (e.target.value || null) as WorkAuth }))}
          className={`${INPUT} self-start`}
        >
          {WORK_AUTH.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="font-label-sm text-label-sm text-text-muted">
          Used as a hard eligibility gate — a posting that requires status you don't have is marked Excluded.
        </p>
      </section>

      <section className={CARD}>
        <h2 className="mb-xs font-headline-md text-headline-md text-on-surface">What you're looking for</h2>
        <p className="mb-sm font-label-sm text-label-sm text-text-muted">
          Just the facts — say how much each one matters in the box below.
        </p>
        <Field label="Locations">
          <TagInput values={mc.locations} onChange={(v) => setMc((p) => ({ ...p, locations: v }))} placeholder="e.g. Toronto — press Enter to add" />
        </Field>
        <Field label="Work mode">
          <ChipToggle options={WORK_MODES} selected={mc.work_modes} onChange={(v) => setMc((p) => ({ ...p, work_modes: v }))} />
        </Field>
        <Field label="Target term">
          <input
            value={mc.target_term}
            onChange={(e) => setMc((p) => ({ ...p, target_term: e.target.value }))}
            placeholder="e.g. Fall 2026"
            className={`${INPUT} max-w-[240px]`}
          />
        </Field>
        <Field label="Term length">
          <ChipToggle options={TERM_LENGTHS} selected={mc.term_lengths} onChange={(v) => setMc((p) => ({ ...p, term_lengths: v }))} />
        </Field>
        <Field label="Spoken languages">
          <TagInput values={mc.languages} onChange={(v) => setMc((p) => ({ ...p, languages: v }))} placeholder="e.g. English — press Enter to add" />
        </Field>
      </section>

      <section className={`${CARD} flex flex-col gap-sm`}>
        <h2 className="font-headline-md text-headline-md text-on-surface">In your own words, what matters most?</h2>
        <p className="font-label-sm text-label-sm text-text-muted">
          The scorer reads this literally — "remote is non-negotiable" makes remote dominate, "a startup would be
          nice" is a small nudge, and "never pure QA" rules postings out.
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={6}
          placeholder="e.g. Remote is non-negotiable. I'd love a startup but it's not a dealbreaker. Never pure QA."
          className={INPUT}
        />
      </section>

      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface-bright md:left-64">
        <div className="mx-auto flex max-w-max-width items-center justify-between px-gutter py-sm">
          <span className="font-label-sm text-label-sm text-text-muted">{status ?? ""}</span>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-primary px-lg py-sm font-label-md text-label-md text-on-primary hover:bg-accent-hover disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save preferences"}
          </button>
        </div>
      </div>
    </div>
  );
}
