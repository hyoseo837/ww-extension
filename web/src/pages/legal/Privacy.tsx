import { Link } from "react-router-dom";
import LegalLayout from "./LegalLayout";

// Draft content derived from docs/reference/legal-pages-scaffold.html (§B).
// Bracketed [..] items are owner-supplied and resolved at the v6.12 copy drop.
export default function Privacy() {
  return (
    <LegalLayout title="Privacy Policy">
      <p>
        <strong>Effective date: [date].</strong> This Privacy Policy explains what
        WW Scorer (operated by [operator name]) collects, how we use it, and your
        choices. We are not affiliated with the University of Waterloo or
        WaterlooWorks. See also our <Link to="/terms">Terms of Service</Link>.
      </p>

      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account identity</strong> — your email and Google account, via Google sign-in. We never store a password.</li>
        <li><strong>Candidate profile</strong> — the CV text and structured profile you upload (education, experience, skills, projects, languages, and related application materials), plus your match criteria and notes.</li>
        <li><strong>Usage records</strong> — the job postings you scan and their AI results, and your credit ledger (purchases, scan charges and refunds, grants).</li>
        <li><strong>Payment</strong> — handled by Stripe. We store ledger entries and a Stripe reference, not your card number.</li>
      </ul>

      <h2>2. How we use it</h2>
      <p>
        To provide AI scoring, run your account, process payments, and respond to
        support requests. [Confirm: we do not use your data for any secondary
        purpose, such as training our own models.]
      </p>

      <h2>3. AI processing</h2>
      <p>
        To score a posting, your profile and the job description are sent to
        Google's Gemini API. [Link Google's data terms; confirm whether content is
        used to improve Google's models on the API tier in use.]
      </p>

      <h2>4. Sharing &amp; sub-processors</h2>
      <p>We do not sell your personal data. We share data only with the providers that run the service:</p>
      <ul>
        <li><strong>Supabase</strong> — authentication and database (Canada).</li>
        <li><strong>Google</strong> — sign-in and the Gemini scoring API.</li>
        <li><strong>Stripe</strong> — payment processing.</li>
        <li><strong>DigitalOcean</strong> — backend hosting (Canada).</li>
        <li><strong>Vercel</strong> — web app hosting.</li>
        <li><strong>Cloudflare</strong> — DNS and support email routing.</li>
      </ul>

      <h2>5. Data location</h2>
      <p>
        Your account and profile data are stored in Canada. Some providers
        (Google, Stripe, Vercel, Cloudflare) may process data elsewhere. [Specify
        jurisdictions if desired.]
      </p>

      <h2>6. Retention</h2>
      <p>
        We keep your data while your account is active. Deleting your account
        removes it (see Your rights). Stripe retains payment records independently
        for its own compliance.
      </p>

      <h2>7. Your rights</h2>
      <p>
        You can access and export your data, correct it, or delete your account at
        any time — in the app or by emailing us. [Tailor to applicable law, e.g.
        PIPEDA or GDPR.]
      </p>

      <h2>8. Security</h2>
      <p>
        Access is protected by token-based authentication and row-level database
        security, and secrets are encrypted. No system is perfectly secure, but we
        work to protect your data.
      </p>

      <h2>9. Cookies &amp; tracking</h2>
      <p>
        We use only the essential browser storage needed to keep you signed in.
        There are no third-party analytics or advertising trackers.
      </p>

      <h2>10. Eligibility</h2>
      <p>[Minimum age; intended for post-secondary co-op students.]</p>

      <h2>11. Changes</h2>
      <p>We may update this policy; the new version will be posted here with a revised effective date.</p>

      <h2>12. Contact</h2>
      <p>Questions about privacy? Email us using the address below.</p>
    </LegalLayout>
  );
}
