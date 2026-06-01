// Credit packages — the single source for the Buy page and the logged-out
// landing pricing. Mirrors the server's CREDIT_PACKAGES (billing/payments.py);
// strictly 1 credit = $0.01 CAD (no bulk discount). The Stitch design's
// "Save %" tiers are illustrative only.
export type CreditPackage = {
  id: string;
  credits: number;
  price: string;
  note: string;
  popular?: boolean;
};

export const PACKAGES: CreditPackage[] = [
  { id: "credits_500", credits: 500, price: "$5", note: "Good for a first batch of scans." },
  { id: "credits_1000", credits: 1000, price: "$10", popular: true, note: "A typical term top-up." },
  { id: "credits_2000", credits: 2000, price: "$20", note: "For a heavy scanning term." },
];
