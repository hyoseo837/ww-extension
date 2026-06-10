// Mirrors the backend Profile contract (server/app/profile/routes.py, ADRs 0013/0015).

export type WorkAuth = "citizen" | "pr" | "international" | "other" | null;

// Criteria v2 (ADR 0041): concrete facts only. Importance lives in the
// free-form `preferences` notes, inferred by the scorer from phrasing.
export type MatchCriteria = {
  work_authorization: WorkAuth;
  // Set by the setup wizard on completion (ADR 0040); onboarding state, not a scoring input.
  wizard_completed_at: string | null;
  locations: string[];
  work_modes: string[];
  target_term: string;
  term_lengths: string[];
  languages: string[];
};

export type EducationEntry = {
  institution: string;
  credential: string;
  field: string;
  grade: string;
  dates: string;
};
export type ExperienceEntry = { title: string; org: string; dates: string; description: string };
export type ProjectEntry = { title: string; description: string };

export type StructuredProfile = {
  summary: string;
  education: EducationEntry[];
  experience: ExperienceEntry[];
  skills: string[];
  projects: ProjectEntry[];
  languages: string[];
  grade_report: string;
  coop_history: string;
  cover_letter: string;
};

export type SupplementEntry = { kind: "experience" | "project"; title: string; description: string };

export type Profile = {
  cv_text: string;
  preferences: string;
  match_criteria: MatchCriteria;
  profile_json: StructuredProfile;
  profile_supplement: SupplementEntry[];
};

// Setup gate (ADR 0040): the wizard flag, or grandfathered pre-wizard criteria
// (work auth set, or any fact entered).
export const setupDone = (mc: Partial<MatchCriteria> | undefined): boolean => {
  if (!mc) return false;
  if (mc.wizard_completed_at || mc.work_authorization || mc.target_term) return true;
  return (["locations", "work_modes", "term_lengths", "languages"] as const)
    .some((k) => (mc[k]?.length ?? 0) > 0);
};

// v1→v2 criteria coercion, mirroring server/app/profile/db.py (ADR 0041).
// Kept web-side too so the new UI works against a backend that hasn't been
// redeployed yet (deploy skew) — a v1 row's `preferred` values become facts.
type V1Criterion = { preferred?: string[] };
export const coerceCriteria = (mc: unknown): MatchCriteria => {
  const m = (mc ?? {}) as Record<string, unknown>;
  const isV1 = ["preferred_locations", "work_modes", "target_term", "target_length", "languages"]
    .some((k) => typeof m[k] === "object" && m[k] !== null && !Array.isArray(m[k]));
  if (!isV1) return { ...emptyMatchCriteria(), ...(m as Partial<MatchCriteria>) };
  const pref = (k: string): string[] => ((m[k] as V1Criterion | undefined)?.preferred ?? []);
  return {
    ...emptyMatchCriteria(),
    work_authorization: (m.work_authorization as WorkAuth) ?? null,
    wizard_completed_at: (m.wizard_completed_at as string | null) ?? null,
    locations: pref("preferred_locations"),
    work_modes: pref("work_modes"),
    target_term: pref("target_term")[0] ?? "",
    term_lengths: pref("target_length"),
    languages: pref("languages"),
  };
};

export const emptyMatchCriteria = (): MatchCriteria => ({
  work_authorization: null,
  wizard_completed_at: null,
  locations: [],
  work_modes: [],
  target_term: "",
  term_lengths: [],
  languages: [],
});
