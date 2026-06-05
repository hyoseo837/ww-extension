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
  { id: "credits_300", credits: 300, price: "$3", note: "About 300 scans." },
  { id: "credits_525", credits: 525, price: "$5", popular: true, note: "500 + 25 bonus credits." },
  { id: "credits_1100", credits: 1100, price: "$10", note: "1,000 + 100 bonus credits — best value." },
];
