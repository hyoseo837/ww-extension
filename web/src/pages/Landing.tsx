import { signInWithGoogle } from "../supabase";

export default function Landing() {
  return (
    <div className="flex min-h-screen items-center justify-center px-gutter">
      <div className="flex max-w-md flex-col items-center gap-md text-center">
        <span className="font-headline-md text-headline-md font-semibold text-primary">WW Scorer</span>
        <h1 className="font-display-lg text-display-lg text-on-surface">
          Score your WaterlooWorks co-op postings with AI
        </h1>
        <p className="font-body-lg text-body-lg text-text-secondary">
          Manage your account, credits, and candidate profile.
        </p>
        <button
          onClick={() => signInWithGoogle()}
          className="mt-sm rounded-lg bg-primary px-xl py-sm font-label-md text-label-md text-on-primary transition-colors hover:bg-accent-hover"
        >
          Sign in with Google
        </button>
      </div>
    </div>
  );
}
