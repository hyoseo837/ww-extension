import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, signInWithGoogle, signOut } from "./supabase";
import { apiGet } from "./api";

// v6.1 signed-in shell: a deliberately minimal smoke test that proves the
// SPA → Supabase → FastAPI chain (auth, CORS, bearer token). Account /
// profile / payment UI arrive in v6.2–v6.3.
export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <main>
        <p>Loading…</p>
      </main>
    );
  }
  return session ? <SignedIn fallbackEmail={session.user.email ?? ""} /> : <SignedOut />;
}

function SignedOut() {
  return (
    <main>
      <h1>WW Extension</h1>
      <p>Sign in to manage your account.</p>
      <button onClick={() => signInWithGoogle()}>Sign in with Google</button>
    </main>
  );
}

function SignedIn({ fallbackEmail }: { fallbackEmail: string }) {
  const [me, setMe] = useState<{ user_id: string; email: string } | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiGet<{ user_id: string; email: string }>("/me"),
      apiGet<{ balance: number }>("/credits/balance"),
    ])
      .then(([m, b]) => {
        setMe(m);
        setBalance(b.balance);
      })
      .catch((e) => setError(String(e)));
  }, []);

  return (
    <main>
      <h1>WW Extension</h1>
      <p>Signed in as {me?.email ?? fallbackEmail}</p>
      <p>Balance: {balance === null ? "…" : `${balance} credits`}</p>
      {error && <p>Could not reach the backend: {error}</p>}
      <button onClick={() => signOut()}>Sign out</button>
    </main>
  );
}
