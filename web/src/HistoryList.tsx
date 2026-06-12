import { useMemo, useState } from "react";
import { fmtCredits, fmtDate, kindLabel } from "./format";
import Icon from "./Icon";

export type Entry = {
  id: string;
  kind: string; // scan | profile_extract | purchase | signup_bonus | admin_grant | referral_bonus
  delta: number;
  created_at: string;
  org: string | null;
  title: string | null;
  posting_id: string | null;
  batch_id: string | null;
};

type Group =
  | { type: "single"; entry: Entry }
  | { type: "batch"; batchId: string; entries: Entry[]; delta: number; created_at: string };

function describe(e: Entry): string {
  if (e.kind === "scan") return e.org ? `Scan · ${e.org}` : "Scan · job posting";
  if (e.kind === "profile_extract") return "Extract application package";
  return kindLabel(e.kind);
}

function iconFor(kind: string): string {
  switch (kind) {
    case "scan":           return "description";
    case "profile_extract": return "upload_file";
    case "purchase":       return "payments";
    case "signup_bonus":   return "redeem";
    case "admin_grant":    return "card_giftcard";
    case "referral_bonus": return "group_add";
    default:               return "receipt_long";
  }
}

// Collapse consecutive scans sharing a batch_id (entries are time-ordered, so a
// batch's scans are contiguous). Everything else, and any lone scan, is single.
function groupEntries(entries: Entry[]): Group[] {
  const out: Group[] = [];
  let i = 0;
  while (i < entries.length) {
    const e = entries[i];
    if (e.kind === "scan" && e.batch_id) {
      const batch: Entry[] = [];
      let j = i;
      while (j < entries.length && entries[j].kind === "scan" && entries[j].batch_id === e.batch_id) {
        batch.push(entries[j]);
        j++;
      }
      if (batch.length > 1) {
        out.push({
          type: "batch",
          batchId: e.batch_id,
          entries: batch,
          delta: batch.reduce((s, x) => s + x.delta, 0),
          created_at: batch[0].created_at,
        });
      } else {
        out.push({ type: "single", entry: e });
      }
      i = j;
    } else {
      out.push({ type: "single", entry: e });
      i++;
    }
  }
  return out;
}

function Amount({ delta }: { delta: number }) {
  return (
    <span className={`font-label-md text-label-md ${delta >= 0 ? "text-positive" : "text-negative"}`}>
      {fmtCredits(delta)}
    </span>
  );
}

function IconBubble({ name }: { name: string }) {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-primary">
      <Icon name={name} className="text-[20px]" />
    </span>
  );
}

function Row({ e }: { e: Entry }) {
  return (
    <div className="flex items-center gap-md border-b border-border py-sm last:border-0">
      <IconBubble name={iconFor(e.kind)} />
      <div className="flex-grow">
        <div className="font-body-md text-body-md text-on-surface">{describe(e)}</div>
        <div className="text-text-muted" style={{ fontSize: 12 }}>{fmtDate(e.created_at)}</div>
      </div>
      <Amount delta={e.delta} />
    </div>
  );
}

function BatchRow({ g }: { g: Extract<Group, { type: "batch" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-md py-sm text-left transition-colors hover:bg-surface-alt"
      >
        <IconBubble name="history" />
        <div className="flex-grow">
          <div className="flex items-center gap-xs font-body-md text-body-md text-on-surface">
            <Icon name={open ? "expand_more" : "chevron_right"} className="text-[20px] text-text-muted" />
            Scanned {g.entries.length} jobs
          </div>
          <div className="text-text-muted" style={{ fontSize: 12, paddingLeft: 26 }}>{fmtDate(g.created_at)}</div>
        </div>
        <Amount delta={g.delta} />
      </button>
      {open && (
        <div className="flex flex-col pb-sm" style={{ paddingLeft: 52 }}>
          {g.entries.map((e) => (
            <div key={e.id} className="flex items-center justify-between py-xs">
              <span className="font-body-md text-body-md text-text-secondary">{describe(e)}</span>
              <Amount delta={e.delta} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HistoryList({ entries, limitRows }: { entries: Entry[]; limitRows?: number }) {
  const groups = useMemo(() => groupEntries(entries), [entries]);
  if (groups.length === 0) {
    return <p className="font-body-md text-body-md text-text-muted">No activity yet.</p>;
  }
  const shown = limitRows ? groups.slice(0, limitRows) : groups;
  return (
    <div>
      {shown.map((g) =>
        g.type === "single" ? <Row key={g.entry.id} e={g.entry} /> : <BatchRow key={g.batchId} g={g} />,
      )}
    </div>
  );
}
