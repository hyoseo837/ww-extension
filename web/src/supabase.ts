import { createClient } from "@supabase/supabase-js";

// Browser Supabase client (ADR 0019). PKCE flow for an SPA; the library
// persists the session and exchanges the OAuth code on redirect back.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { flowType: "pkce" } },
);

export function signInWithGoogle() {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}
