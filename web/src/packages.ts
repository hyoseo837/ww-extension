// Credit packages — the single source for the Buy page and the logged-out
// landing pricing. MUST mirror the server's CREDIT_PACKAGES
// (billing/payments.py). Base rate 1 credit = $0.01 CAD; a scan runs about
// 2 credits (measured live 2026-06-11: 35 scans → 67.9 credits — v8.5's
// richer prompt outgrew ADR 0034's ~1/scan); bigger packs include bonus
// credits (ADR 0034).
export type CreditPackage = {
  id: string;
  credits: number;
  price: string;
  note: string;
  popular?: boolean;
};

export const PACKAGES: CreditPackage[] = [
  { id: "credits_525", credits: 525, price: "$5", popular: true, note: "500 + 25 bonus" },
  { id: "credits_1100", credits: 1100, price: "$10", note: "1,000 + 100 bonus" },
  { id: "credits_2500", credits: 2500, price: "$20", note: "2,000 + 500 bonus" },
];
