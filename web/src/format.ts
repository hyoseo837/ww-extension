// Humanize ledger entry kinds for display.
export function kindLabel(kind: string): string {
  switch (kind) {
    case "purchase":     return "Purchase";
    case "signup_bonus": return "Signup bonus";
    case "scan_debit":   return "Scan";
    case "scan_refund":  return "Scan refund";
    case "admin_grant":  return "Gift credit";
    default:             return kind;
  }
}

// Credits with up to 2 decimals, no trailing zeros, signed.
export function fmtCredits(n: number): string {
  const v = Math.round(n * 100) / 100;
  return (v >= 0 ? "+" : "") + v;
}
