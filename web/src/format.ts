// Humanize non-scan ledger kinds. Scan items are described in HistoryList
// (with org), so only the ledger kinds need a label here.
export function kindLabel(kind: string): string {
  switch (kind) {
    case "purchase":       return "Purchase";
    case "signup_bonus":   return "Signup bonus";
    case "admin_grant":    return "Gift credit";
    case "referral_bonus": return "Friend invite bonus";
    default:               return kind;
  }
}

// Credits with up to 2 decimals, no trailing zeros, signed.
export function fmtCredits(n: number): string {
  const v = Math.round(n * 100) / 100;
  return (v >= 0 ? "+" : "") + v;
}

// A balance for display: thousands-separated, at most 2 decimals (the raw
// NUMERIC carries 6, which is just noise on screen), no forced trailing zeros.
export function fmtBalance(n: number): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

// "credit" / "credits" unit label, so a balance reads "142 credits", not "142".
export function creditUnit(n: number): string {
  return Math.abs(n) === 1 ? "credit" : "credits";
}
