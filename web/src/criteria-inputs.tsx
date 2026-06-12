import { useState } from "react";

// Shared input primitives for the match-criteria editors (v8.13) — the
// Preferences page and the setup wizard write the same match_criteria jsonb
// and previously each carried verbatim copies of these.

export const WORK_MODES = ["Remote", "Hybrid", "On-site"];
export const TERM_LENGTHS = ["4-month", "8-month"];

const CHIP_ON = "rounded-full bg-primary px-md py-xs font-label-md text-label-md text-on-primary";
const CHIP_OFF = "rounded-full border border-border bg-surface px-md py-xs font-label-md text-label-md text-text-secondary transition-colors hover:border-primary hover:text-primary";

export function ChipToggle({ options, selected, onChange }: {
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

// Single-select chips (click again to clear). A stored value not in the
// options (legacy free text) is shown as an extra chip so it stays visible.
export function ChipSelect({ options, value, onChange }: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const all = value && !options.includes(value) ? [value, ...options] : options;
  return (
    <div className="flex flex-wrap gap-sm">
      {all.map((o) => (
        <button key={o} type="button" onClick={() => onChange(value === o ? "" : o)} className={value === o ? CHIP_ON : CHIP_OFF}>
          {o}
        </button>
      ))}
    </div>
  );
}

// Type a value, Enter/comma/blur adds a removable chip.
export function TagInput({ values, onChange, placeholder }: {
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
        className="rounded-lg border border-border bg-surface px-sm py-sm font-body-md text-body-md outline-none focus:border-primary"
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
