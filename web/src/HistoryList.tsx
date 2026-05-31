import { useMemo, useState } from "react";
import { fmtCredits, kindLabel } from "./format";

export type Entry = {
  id: string;
  kind: string; // scan | profile_extract | purchase | signup_bonus | admin_grant
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

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString();

// Collapse consecutive scans sharing a batch_id into one group (entries are
// time-ordered, so a batch's scans are contiguous). Everything else, and any
// lone scan, stays a single row.
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
  return <span className={delta >= 0 ? "amount-pos" : "amount-neg"}>{fmtCredits(delta)}</span>;
}

function Row({ e }: { e: Entry }) {
  return (
    <div className="row">
      <div>
        <div>{describe(e)}</div>
        <div className="muted small">{fmtDate(e.created_at)}</div>
      </div>
      <Amount delta={e.delta} />
    </div>
  );
}

function BatchRow({ g }: { g: Extract<Group, { type: "batch" }> }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <div className="row batch-head" onClick={() => setOpen((o) => !o)}>
        <div>
          <div>
            <span className="toggle">{open ? "▾" : "▸"}</span>
            Scanned {g.entries.length} jobs
          </div>
          <div className="muted small">{fmtDate(g.created_at)}</div>
        </div>
        <Amount delta={g.delta} />
      </div>
      {open &&
        g.entries.map((e) => (
          <div className="row batch-child" key={e.id}>
            <div>{describe(e)}</div>
            <Amount delta={e.delta} />
          </div>
        ))}
    </>
  );
}

export default function HistoryList({ entries, limitRows }: { entries: Entry[]; limitRows?: number }) {
  const groups = useMemo(() => groupEntries(entries), [entries]);
  if (groups.length === 0) return <p className="muted">No activity yet.</p>;
  const shown = limitRows ? groups.slice(0, limitRows) : groups;
  return (
    <>
      {shown.map((g) =>
        g.type === "single" ? <Row key={g.entry.id} e={g.entry} /> : <BatchRow key={g.batchId} g={g} />,
      )}
    </>
  );
}
