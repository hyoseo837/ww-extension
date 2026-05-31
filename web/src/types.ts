// Mirrors the backend Profile contract (server/app/profile/routes.py, ADRs 0013/0015).

export type Weight = "must" | "strong" | "nice-to-have";
export type Tier = "preferred" | "acceptable" | "avoid" | "excluded";

export type WeightedCriterion = {
  weight: Weight;
  preferred: string[];
  acceptable: string[];
  avoid: string[];
  excluded: string[];
};

export type WorkAuth = "citizen" | "pr" | "international" | "other" | null;

export type MatchCriteria = {
  work_authorization: WorkAuth;
  preferred_locations: WeightedCriterion;
  work_modes: WeightedCriterion;
  target_term: WeightedCriterion;
  target_length: WeightedCriterion;
  languages: WeightedCriterion;
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

export const emptyCriterion = (): WeightedCriterion => ({
  weight: "nice-to-have",
  preferred: [],
  acceptable: [],
  avoid: [],
  excluded: [],
});

export const emptyMatchCriteria = (): MatchCriteria => ({
  work_authorization: null,
  preferred_locations: emptyCriterion(),
  work_modes: emptyCriterion(),
  target_term: emptyCriterion(),
  target_length: emptyCriterion(),
  languages: emptyCriterion(),
});
