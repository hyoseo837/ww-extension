import { createClient } from "@supabase/supabase-js";

// Browser Supabase client (ADR 0019). PKCE flow for an SPA; the library
// persists the session and exchanges the OAuth code on redirect back.
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY,
  { auth: { flowType: "pkce" } },
);

export function signInWithMicrosoft() {
  return supabase.auth.signInWithOAuth({
    provider: "azure",
    // Request the email claim (added as an Entra optional claim) so the
    // session carries an @uwaterloo.ca email — ADR 0036.
    options: { redirectTo: window.location.origin, scopes: "email" },
  });
}

export function signOut() {
  return supabase.auth.signOut();
}
