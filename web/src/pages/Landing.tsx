import { signInWithGoogle } from "../supabase";

export default function Landing() {
  return (
    <div className="center">
      <div className="hero">
        <div className="brand" style={{ fontSize: "1.3rem", marginBottom: 16 }}>
          WW Scorer
        </div>
        <h1>Score your WaterlooWorks co-op postings with AI</h1>
        <p className="muted" style={{ marginBottom: 24 }}>
          Manage your account, credits, and candidate profile.
        </p>
        <button className="btn btn-primary" onClick={() => signInWithGoogle()}>
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
