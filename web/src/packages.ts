// Credit packages — the single source for the Buy page and the logged-out
// landing pricing. MUST mirror the server's CREDIT_PACKAGES
// (billing/payments.py). Base rate 1 credit = $0.01 CAD (≈ 1 scan); bigger
// packs include bonus credits (ADR 0034).
export type CreditPackage = {
  id: string;
  credits: number;
  price: string;
  note: string;
  popular?: boolean;
};

export const PACKAGES: CreditPackage[] = [
  { id: "credits_100", credits: 100, price: "$1", note: "About 100 scans." },
  { id: "credits_550", credits: 550, price: "$5", popular: true, note: "500 + 50 bonus credits." },
  { id: "credits_1200", credits: 1200, price: "$10", note: "1,000 + 200 bonus credits — best value." },
];
