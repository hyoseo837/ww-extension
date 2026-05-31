import { supabase } from "./supabase";

// Trailing slashes would produce `//me` (404), so normalize them away.
const BASE = import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "");

// Authenticated GET against the FastAPI backend. Attaches the current
// Supabase session JWT as a bearer token (ADR 0021 — the web app is an
// independent client of the same backend the extension uses).
export async function apiGet<T>(path: string): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}
