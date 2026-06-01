import { supabase } from "./supabase";

// Trailing slashes would produce `//me` (404), so normalize them away.
const BASE = import.meta.env.VITE_API_BASE_URL.replace(/\/+$/, "");

// Throw on a non-2xx response, surfacing the backend's `detail` when present
// (e.g. "no user with email: …") while keeping the status code as the prefix
// so callers can still branch on it (the admin page checks for "403").
async function throwForStatus(res: Response): Promise<never> {
  let detail = "";
  try {
    const body = await res.json();
    if (typeof body?.detail === "string") detail = body.detail;
  } catch {
    /* no JSON body */
  }
  throw new Error(`${res.status} ${detail || res.statusText}`);
}

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
  if (!res.ok) await throwForStatus(res);
  return res.json() as Promise<T>;
}

// Authenticated POST/PUT with a JSON body.
async function apiSend<T>(method: "POST" | "PUT", path: string, body: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not signed in");

  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) await throwForStatus(res);
  return res.json() as Promise<T>;
}

export const apiPost = <T>(path: string, body: unknown) => apiSend<T>("POST", path, body);
export const apiPut = <T>(path: string, body: unknown) => apiSend<T>("PUT", path, body);
