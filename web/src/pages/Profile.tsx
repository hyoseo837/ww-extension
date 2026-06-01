import { useEffect, useRef, useState } from "react";
import { apiGet, apiPost, apiPut } from "../api";
import { useDashboard } from "../Layout";
import Icon from "../Icon";
import type { Profile as ProfileT, StructuredProfile, SupplementEntry } from "../types";

const CARD = "rounded-xl border border-border bg-surface p-lg shadow-[0_2px_8px_rgba(41,38,31,0.04)]";
const SECTION_TITLE = "font-headline-md text-headline-md text-on-surface";
const MAX_PDF = 5 * 1024 * 1024;

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).replace(/^data:[^;]+;base64,/, ""));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

function Chips({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-xs">
      {items.map((s, i) => (
        <span key={i} className="rounded-full bg-accent-soft px-sm py-base font-label-sm text-label-sm text-primary">
          {s}
        </span>
      ))}
    </div>
  );
}

// Read-only render of the extracted profile_json (extraction-owned, ADR 0015).
function ExtractedProfile({ p }: { p: StructuredProfile }) {
  const empty =
    !p.summary &&
    p.education.length === 0 &&
    p.experience.length === 0 &&
    p.skills.length === 0 &&
    p.projects.length === 0 &&
    p.languages.length === 0;
  if (empty) {
    return (
      <p className="font-body-md text-body-md text-text-muted">
        No profile yet — upload your application package above to extract it.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-lg">
      {p.summary && (
        <div>
          <h3 className="mb-xs font-label-md text-label-md uppercase tracking-wider text-text-muted">Summary</h3>
          <p className="font-body-md text-body-md text-on-surface">{p.summary}</p>
        </div>
      )}
      {p.experience.length > 0 && (
        <div className="flex flex-col gap-sm">
          <h3 className="font-label-md text-label-md uppercase tracking-wider text-text-muted">Experience</h3>
          {p.experience.map((e, i) => (
            <div key={i}>
              <div className="font-body-md text-body-md font-semibold text-on-surface">{e.title}</div>
              <div className="text-label-sm text-text-secondary">
                {[e.org, e.dates].filter(Boolean).join(" · ")}
              </div>
              {e.description && <p className="mt-base font-body-md text-body-md text-text-secondary">{e.description}</p>}
            </div>
          ))}
        </div>
      )}
      {p.education.length > 0 && (
        <div className="flex flex-col gap-sm">
          <h3 className="font-label-md text-label-md uppercase tracking-wider text-text-muted">Education</h3>
          {p.education.map((e, i) => (
            <div key={i}>
              <div className="font-body-md text-body-md font-semibold text-on-surface">{e.institution}</div>
              <div className="text-label-sm text-text-secondary">
                {[e.credential, e.field, e.grade, e.dates].filter(Boolean).join(" · ")}
              </div>
            </div>
          ))}
        </div>
      )}
      {p.projects.length > 0 && (
        <div className="flex flex-col gap-sm">
          <h3 className="font-label-md text-label-md uppercase tracking-wider text-text-muted">Projects</h3>
          {p.projects.map((e, i) => (
            <div key={i}>
              <div className="font-body-md text-body-md font-semibold text-on-surface">{e.title}</div>
              {e.description && <p className="font-body-md text-body-md text-text-secondary">{e.description}</p>}
            </div>
          ))}
        </div>
      )}
      {p.skills.length > 0 && (
        <div className="flex flex-col gap-xs">
          <h3 className="font-label-md text-label-md uppercase tracking-wider text-text-muted">Skills</h3>
          <Chips items={p.skills} />
        </div>
      )}
      {p.languages.length > 0 && (
        <div className="flex flex-col gap-xs">
          <h3 className="font-label-md text-label-md uppercase tracking-wider text-text-muted">Languages</h3>
          <Chips items={p.languages} />
        </div>
      )}
    </div>
  );
}

export default function Profile() {
  const { refetchBalance } = useDashboard();
  const fileRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<ProfileT | null>(null);
  const [supplement, setSupplement] = useState<SupplementEntry[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<ProfileT>("/profile")
      .then((p) => {
        setProfile(p);
        setSupplement(p.profile_supplement);
      })
      .catch((e) => setStatus(`Could not load profile: ${e}`));
  }, []);

  async function onFile(file: File) {
    if (file.size > MAX_PDF) {
      setStatus("File exceeds the 5 MB limit.");
      return;
    }
    setExtracting(true);
    setStatus(null);
    try {
      const pdf_b64 = await fileToBase64(file);
      const res = await apiPost<{ cost: number }>("/profile/extract", {
        scan_id: crypto.randomUUID(),
        pdf_b64,
      });
      const fresh = await apiGet<ProfileT>("/profile");
      setProfile(fresh);
      setSupplement(fresh.profile_supplement);
      refetchBalance();
      setStatus(`Profile extracted (cost ${res.cost.toFixed(2)} credits).`);
    } catch (e) {
      setStatus(`Extraction failed: ${e}`);
    } finally {
      setExtracting(false);
    }
  }

  async function save() {
    setSaving(true);
    setStatus(null);
    try {
      const clean = supplement.filter((s) => s.title.trim() || s.description.trim());
      const res = await apiPut<ProfileT>("/profile", { profile_supplement: clean });
      setProfile(res);
      setSupplement(res.profile_supplement);
      setStatus("Saved.");
    } catch (e) {
      setStatus(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  }

  const setEntry = (i: number, patch: Partial<SupplementEntry>) =>
    setSupplement((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  const addEntry = (kind: "experience" | "project") =>
    setSupplement((prev) => [...prev, { kind, title: "", description: "" }]);
  const removeEntry = (i: number) => setSupplement((prev) => prev.filter((_, idx) => idx !== i));

  if (!profile) {
    return (
      <div className="mx-auto w-full max-w-max-width px-gutter py-xl">
        <p className="font-body-md text-body-md text-text-muted">{status ?? "Loading…"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-max-width flex-col gap-xl px-gutter py-xl pb-[96px]">
      <header className="flex flex-col gap-xs">
        <h1 className="font-display-lg text-display-lg text-on-surface">Candidate profile</h1>
        <p className="font-body-lg text-body-lg text-text-secondary">
          Upload your application package, then add anything your resume leaves out.
        </p>
      </header>

      {/* Upload */}
      <section className={CARD}>
        <h2 className={`mb-md ${SECTION_TITLE}`}>Application package</h2>
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          disabled={extracting}
          className="flex w-full flex-col items-center gap-xs rounded-lg border border-dashed border-outline-variant bg-surface-alt px-lg py-xl text-center transition-colors hover:bg-surface-container-low disabled:opacity-60"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft text-primary">
            <Icon name="upload_file" className="text-[24px]" />
          </span>
          <span className="font-label-md text-label-md text-primary">
            {extracting ? "Extracting…" : "Click to upload or drag and drop"}
          </span>
          <span className="font-label-sm text-label-sm text-text-muted">PDF, up to 5 MB · uses a small number of credits</span>
        </button>
      </section>

      {/* Extracted profile (read-only) */}
      <section className={CARD}>
        <h2 className={`mb-md ${SECTION_TITLE}`}>Extracted from your package</h2>
        <ExtractedProfile p={profile.profile_json} />
      </section>

      {/* Supplementary entries (editable) */}
      <section className={CARD}>
        <div className="mb-sm flex items-center justify-between">
          <h2 className={SECTION_TITLE}>Your additions</h2>
          <div className="flex gap-xs">
            <button
              onClick={() => addEntry("experience")}
              className="flex items-center gap-base rounded-lg border border-border px-md py-base font-label-md text-label-md text-primary hover:bg-surface-alt"
            >
              <Icon name="add" className="text-[18px]" /> Experience
            </button>
            <button
              onClick={() => addEntry("project")}
              className="flex items-center gap-base rounded-lg border border-border px-md py-base font-label-md text-label-md text-primary hover:bg-surface-alt"
            >
              <Icon name="add" className="text-[18px]" /> Project
            </button>
          </div>
        </div>
        <p className="mb-md font-label-sm text-label-sm text-text-muted">
          Experience or projects your one-page resume omits. Re-uploading never erases these.
        </p>
        {supplement.length === 0 ? (
          <p className="font-body-md text-body-md text-text-muted">Nothing added yet.</p>
        ) : (
          <div className="flex flex-col gap-md">
            {supplement.map((e, i) => (
              <div key={i} className="flex flex-col gap-sm rounded-lg border border-border p-md">
                <div className="flex items-center gap-sm">
                  <select
                    value={e.kind}
                    onChange={(ev) => setEntry(i, { kind: ev.target.value as "experience" | "project" })}
                    className="rounded-lg border border-border bg-surface px-sm py-base font-label-md text-label-md"
                  >
                    <option value="experience">Experience</option>
                    <option value="project">Project</option>
                  </select>
                  <input
                    value={e.title}
                    onChange={(ev) => setEntry(i, { title: ev.target.value })}
                    placeholder="Title"
                    className="flex-grow rounded-lg border border-border bg-surface px-sm py-base font-body-md text-body-md"
                  />
                  <button
                    onClick={() => removeEntry(i)}
                    className="font-label-md text-label-md text-text-muted hover:text-negative"
                  >
                    Remove
                  </button>
                </div>
                <textarea
                  value={e.description}
                  onChange={(ev) => setEntry(i, { description: ev.target.value })}
                  placeholder="Description"
                  rows={3}
                  className="rounded-lg border border-border bg-surface px-sm py-sm font-body-md text-body-md"
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Sticky save bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-surface-bright md:left-64">
        <div className="mx-auto flex max-w-max-width items-center justify-between px-gutter py-sm">
          <span className="font-label-sm text-label-sm text-text-muted">{status ?? ""}</span>
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-primary px-lg py-sm font-label-md text-label-md text-on-primary hover:bg-accent-hover disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save profile"}
          </button>
        </div>
      </div>
    </div>
  );
}
