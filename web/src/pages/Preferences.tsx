import { useEffect, useState } from "react";
import { apiGet, apiPut } from "../api";
import { emptyMatchCriteria } from "../types";
import type { MatchCriteria, Profile, Tier, Weight, WeightedCriterion, WorkAuth } from "../types";

const CARD = "rounded-xl border border-border bg-surface p-lg shadow-[0_2px_8px_rgba(41,38,31,0.04)]";

const WEIGHTS: Weight[] = ["nice-to-have", "strong", "must"];
const TIER_HINTS: Record<Tier, string> = {
  preferred: "Preferred — ideal",
  acceptable: "Acceptable — no penalty",
  avoid: "Avoid — penalized",
  excluded: "Excluded — never",
};

type WeightedKey = "preferred_locations" | "work_modes" | "target_term" | "target_length" | "languages";
const CRITERIA: { key: WeightedKey; label: string; placeholder: string }[] = [
  { key: "preferred_locations", label: "Locations", placeholder: "e.g. Toronto" },
  { key: "work_modes", label: "Work mode", placeholder: "e.g. remote, hybrid" },
  { key: "target_term", label: "Target term", placeholder: "e.g. Fall 2026" },
  { key: "target_length", label: "Term length", placeholder: "e.g. 4-month" },
  { key: "languages", label: "Spoken languages", placeholder: "e.g. English" },
];

const WORK_AUTH: { value: string; label: string }[] = [
  { value: "", label: "Unspecified" },
  { value: "citizen", label: "Canadian citizen" },
  { value: "pr", label: "Permanent resident" },
  { value: "international", label: "International (study permit)" },
  { value: "other", label: "Other" },
];

const INPUT = "rounded-lg border border-border bg-surface px-sm py-base font-label-md text-label-md";

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
    <div className="flex flex-wrap items-center gap-xs rounded-lg border border-border bg-surface px-sm py-xs">
      {values.map((v) => (
        <span key={v} className="flex items-center gap-base rounded-full bg-accent-soft px-sm py-base font-label-sm text-label-sm text-primary">
          {v}
          <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} className="leading-none text-primary/60 hover:text-primary">
            ×
          </button>
        </span>
      ))}
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
        className="min-w-[140px] flex-grow bg-transparent py-base font-body-md text-body-md outline-none"
      />
    </div>
  );
}

function CriterionEditor({ label, placeholder, value, onChange }: {
  label: string;
  placeholder: string;
  value: WeightedCriterion;
  onChange: (c: WeightedCriterion) => void;
}) {
  const hasMore =
    value.acceptable.length > 0 || value.avoid.length > 0 || value.excluded.length > 0 || value.weight !== "nice-to-have";
  const [more, setMore] = useState(hasMore);
  const set = (patch: Partial<WeightedCriterion>) => onChange({ ...value, ...patch });

  return (
    <div className="flex flex-col gap-sm border-b border-border py-md last:border-0">
      <div className="flex items-center justify-between">
        <span className="font-label-md text-label-md text-on-surface">{label}</span>
        <button type="button" onClick={() => setMore((m) => !m)} className="font-label-sm text-label-sm text-text-secondary hover:text-primary">
          {more ? "Fewer options" : "More options"}
        </button>
      </div>
      <div>
        <label className="mb-base block font-label-sm text-label-sm text-text-muted">{TIER_HINTS.preferred}</label>
        <TagInput values={value.preferred} onChange={(v) => set({ preferred: v })} placeholder={placeholder} />
      </div>
      {more && (
        <>
          <div>
            <label className="mb-base block font-label-sm text-label-sm text-text-muted">Weight</label>
            <select value={value.weight} onChange={(e) => set({ weight: e.target.value as Weight })} className={INPUT}>
              {WEIGHTS.map((w) => (
                <option key={w} value={w}>{w}</option>
              ))}
            </select>
          </div>
          {(["acceptable", "avoid", "excluded"] as Tier[]).map((t) => (
            <div key={t}>
              <label className="mb-base block font-label-sm text-label-sm text-text-muted">{TIER_HINTS[t]}</label>
              <TagInput values={value[t]} onChange={(v) => set({ [t]: v } as Partial<WeightedCriterion>)} placeholder="Add and press Enter" />
            </div>
          ))}
        </>
      )}
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

  const setCriterion = (key: WeightedKey, c: WeightedCriterion) => setMc((prev) => ({ ...prev, [key]: c }));

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
          Tell the AI what you're looking for in a co-op so it scores postings against your criteria.
        </p>
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
        <h2 className="mb-xs font-headline-md text-headline-md text-on-surface">Preferences</h2>
        <p className="mb-sm font-label-sm text-label-sm text-text-muted">
          List values per tier. "More options" reveals weight and the acceptable / avoid / excluded tiers.
        </p>
        {CRITERIA.map((f) => (
          <CriterionEditor
            key={f.key}
            label={f.label}
            placeholder={f.placeholder}
            value={mc[f.key]}
            onChange={(c) => setCriterion(f.key, c)}
          />
        ))}
      </section>

      <section className={`${CARD} flex flex-col gap-sm`}>
        <h2 className="font-headline-md text-headline-md text-on-surface">Additional notes</h2>
        <p className="font-label-sm text-label-sm text-text-muted">
          Free-form context the scorer weighs alongside the structured criteria above.
        </p>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={5}
          placeholder="e.g. Prefer frontend roles at mid-size startups; strong interest in teams that mentor co-ops."
          className="rounded-lg border border-border bg-surface px-sm py-sm font-body-md text-body-md"
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
