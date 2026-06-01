import { Link } from "react-router-dom";
import LegalLayout from "./LegalLayout";

// Draft content derived from docs/reference/legal-pages-scaffold.html (§C).
// Bracketed [..] items are owner-supplied; the refund section is gated on
// ADR 0028 and resolved at the v6.12 copy drop.
export default function Terms() {
  return (
    <LegalLayout title="Terms of Service">
      <p>
        <strong>Effective date: [date].</strong> These terms govern your use of
        WW Scorer, operated by [operator name].
      </p>

      <h2>1. Acceptance</h2>
      <p>
        By signing in and using WW Scorer, you agree to these terms and to our{" "}
        <Link to="/privacy">Privacy Policy</Link>.
      </p>

      <h2>2. The service</h2>
      <p>
        WW Scorer uses AI to score WaterlooWorks co-op postings against your
        profile and criteria. We are not affiliated with, endorsed by, or
        connected to the University of Waterloo or WaterlooWorks.
      </p>

      <h2>3. Eligibility &amp; accounts</h2>
      <p>
        You need a Google account to sign in, and you are responsible for activity
        on your account. [Age / student requirement.]
      </p>

      <h2>4. Credits &amp; payment</h2>
      <p>
        The service runs on credits (1 credit = $0.01 CAD), bought as one-time
        purchases through Stripe — there is no subscription. Each scan spends
        credits from your balance.
      </p>

      <h2>5. Refunds</h2>
      <p>
        [Refund policy — pending ADR 0028. Proposed: purchased credits are
        non-refundable except where the law requires; a scan that fails is not
        charged (the credit is returned automatically); unused balances may be
        refunded at our discretion.]
      </p>

      <h2>6. Acceptable use</h2>
      <p>
        Don't abuse, reverse-engineer, or resell the service, and comply with
        WaterlooWorks' and the University of Waterloo's own terms when using the
        extension on their site.
      </p>

      <h2>7. AI output</h2>
      <p>
        Scores are guidance only. They may be inaccurate and are not career or
        application advice; don't rely on them as the sole basis for your
        decisions.
      </p>

      <h2>8. Third-party services</h2>
      <p>
        The service depends on Google, Stripe, Supabase and others, each governed
        by their own terms.
      </p>

      <h2>9. Disclaimers &amp; liability</h2>
      <p>
        The service is provided "as is", without warranties. [Limitation of
        liability — finalize with legal review.]
      </p>

      <h2>10. Termination</h2>
      <p>
        You may delete your account at any time. We may suspend or terminate
        accounts for abuse or violation of these terms.
      </p>

      <h2>11. Changes</h2>
      <p>We may update these terms; continued use after a change means you accept the updated terms.</p>

      <h2>12. Governing law</h2>
      <p>[Governing law — e.g. Ontario, Canada.]</p>

      <h2>13. Contact</h2>
      <p>Questions about these terms? Email us using the address below.</p>
    </LegalLayout>
  );
}
