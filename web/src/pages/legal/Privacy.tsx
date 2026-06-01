import { Link } from "react-router-dom";
import LegalLayout from "./LegalLayout";

// Final copy. Inputs captured from the v6.12 legal intake (2026-06-01):
// operator Hyoseo Lee, Canada-only users (PIPEDA), paid Gemini tier.
export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        <strong>Effective date: June 1, 2026.</strong> This Privacy Policy
        explains what WW Scorer (operated by Hyoseo Lee, "we") collects, how we
        use it, and your choices. We are not affiliated with the University of
        Waterloo or WaterlooWorks. See also our <Link to="/terms">Terms of
        Service</Link>.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account identity</strong> — your email and Google account, via Google sign-in. We never store a password.</li>
        <li><strong>Candidate profile</strong> — the CV text and structured profile you upload (education, experience, skills, projects, languages, and related application materials), plus your match criteria and notes.</li>
        <li><strong>Usage records</strong> — the job postings you scan and their AI results, and your credit ledger (purchases, scan charges and refunds, grants).</li>
        <li><strong>Payment</strong> — handled by Stripe. We store ledger entries and a Stripe reference, not your card number.</li>
      </ul>

      <h2>2. What we don't collect</h2>
      <ul>
        <li>Your <strong>card or banking details</strong> — Stripe handles payment; we never see or store your full card number.</li>
        <li>A <strong>password</strong> — sign-in is through Google, so we never create or hold one.</li>
        <li>Your <strong>activity outside WW Scorer</strong> — we don't track your browsing; we only see the postings you choose to scan.</li>
        <li><strong>Location, device fingerprints, or advertising identifiers.</strong></li>
        <li>Personal data about you <strong>bought from or supplied by third parties</strong> — everything we hold comes from you or from your use of the service.</li>
      </ul>

      <h2>3. How we use it</h2>
      <p>
        We use your data only to provide AI scoring, run your account, process
        payments, and respond to support requests. We do not sell your data, use
        it for advertising, or use it to train our own models.
      </p>

      <h2>4. AI processing</h2>
      <p>
        To score a posting, your profile and the job description are sent to
        Google's Gemini API to generate the result. We use a paid Gemini API
        tier; under Google's API terms for paid services, Google does not use the
        content we submit to train or improve its models.
      </p>

      <h2>5. Sharing &amp; sub-processors</h2>
      <p>We do not sell your personal data. We share data only with the providers that run the service:</p>
      <ul>
        <li><strong>Supabase</strong> — authentication and database (Canada).</li>
        <li><strong>Google</strong> — sign-in and the Gemini scoring API.</li>
        <li><strong>Stripe</strong> — payment processing.</li>
        <li><strong>DigitalOcean</strong> — backend hosting (Canada).</li>
        <li><strong>Vercel</strong> — web app hosting.</li>
        <li><strong>Cloudflare</strong> — DNS and support email routing.</li>
      </ul>

      <h2>6. Data location</h2>
      <p>
        Your account and profile data are stored in Canada. Some of the providers
        above (such as Google, Stripe, Vercel, and Cloudflare) may process data in
        other countries, where it can be subject to the laws of those
        jurisdictions.
      </p>

      <h2>7. Retention</h2>
      <p>
        We keep your data while your account is active. Deleting your account
        removes it (see Your rights). Stripe retains payment records independently
        for its own legal and compliance purposes.
      </p>
      <p>
        One exception survives deletion: a one-way cryptographic hash of your
        email address. We keep it solely to enforce our one-time signup bonus —
        so the same account can't be deleted and re-created to claim the bonus
        repeatedly. The hash can't be reversed to your email and is used for
        nothing else.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Under Canada's <abbr title="Personal Information Protection and Electronic Documents Act">PIPEDA</abbr>,
        you can access the personal information we hold about you, ask us to
        correct it, withdraw your consent, and delete your account — in the app or
        by emailing us. You can also request an export of your data.
      </p>

      <h2>9. Security</h2>
      <p>
        Access is protected by token-based authentication and row-level database
        security, and secrets are encrypted. No system is perfectly secure, but we
        work to protect your data.
      </p>

      <h2>10. Cookies &amp; tracking</h2>
      <p>
        We use only the essential browser storage needed to keep you signed in.
        There are no third-party analytics or advertising trackers.
      </p>

      <h2>11. Eligibility</h2>
      <p>
        WW Scorer is intended for enrolled post-secondary co-op students aged 16
        or older.
      </p>

      <h2>12. Changes</h2>
      <p>We may update this policy; the new version will be posted here with a revised effective date.</p>

      <h2>13. Contact</h2>
      <p>Questions about privacy? Email us using the address below.</p>
    </LegalLayout>
  );
}
