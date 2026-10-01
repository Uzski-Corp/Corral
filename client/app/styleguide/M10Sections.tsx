"use client";
/* /styleguide: M10 (ENG-60) Every state, indexed from lib/states, with the four pieces every state is built from. */
import type { ReactNode } from "react";
import { AppSkeleton, Button, EmptyState, ErrorState, Icon, Skeleton, SkeletonTable } from "@/components/app";
import { KINDS, ROUTE_STATES, SURFACES, countsOf, hrefOf, kindOf, type StateKind } from "@/lib/states";

const Label = ({ children }: { children: ReactNode }) => <span className="sg-label">{children}</span>;
const ORDER: Record<StateKind, number> = { empty: 0, loading: 1, error: 2, partial: 3, progress: 4, view: 5 };

export function EveryStateDemo() {
  return (
    <div className="sg-m10">
      <div className="sg-card sg-m10-index">
        <Label>every review state, by surface · /app/…?state=…</Label>
        <table className="sg-m10-table" aria-label="Review states by surface and kind">
          <thead><tr><th scope="col">Surface</th>{KINDS.map((k) => <th key={k} scope="col" className="c-num">{k}</th>)}<th scope="col">States</th></tr></thead>
          <tbody>
            {SURFACES.map((s) => {
              const c = countsOf(s);
              const list = [...s.states].sort((a, b) => ORDER[kindOf(a, s)] - ORDER[kindOf(b, s)]);
              return (
                <tr key={s.id} id={`state-${s.id}`}>
                  <th scope="row"><b>{s.label}</b><span className="c-muted">{s.milestone}</span></th>
                  {KINDS.map((k) => <td key={k} className="c-num">{c[k] ? c[k] : s.na?.[k] ? <span className="sg-m10-na" title={s.na[k]}>n/a</span> : <span className="c-muted">·</span>}</td>)}
                  <td className="sg-m10-states">
                    {list.length ? list.map((st) => <a key={st} className={`sg-m10-st is-${kindOf(st, s)}`} href={hrefOf(s, st)}><code>{st}</code></a>) : <span className="c-muted">{s.na?.empty}</span>}
                    {s.na && list.length > 0 && <span className="sg-m10-why">{Object.entries(s.na).map(([k, v]) => <span key={k}><b>No {k}:</b> {v} </span>)}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <Label>route level · Next files</Label>
        <ul className="sg-anatomy">{ROUTE_STATES.map((r) => <li key={r.file}><code>{r.file}</code> · {r.kind}: {r.what}</li>)}</ul>
      </div>
      <div className="sg-card"><Label>empty · what goes here, and the one thing to do</Label>
        <EmptyState compact art="grass" title="No contacts yet" actions={<Button variant="primary"><Icon name="search" />Find companies</Button>}>People arrive as Corral reads companies, with where it found them.</EmptyState></div>
      <div className="sg-card"><Label>error · what failed, nothing lost, Try again, the request</Label>
        <ErrorState title="Couldn’t load contacts" detail="GET /api/v1/contacts · 503" actions={<Button variant="primary"><Icon name="refresh" />Try again</Button>}>Nothing is lost. Corral keeps reading companies while this page is down.</ErrorState></div>
      <div className="sg-card"><Label>loading · one skeleton, at real sizes</Label>
        <div className="sg-m10-skel"><Skeleton w={180} h={12} /><Skeleton w="70%" h={10} /><Skeleton w="50%" h={10} /></div>
        <div className="c-win c-win--flat sg-m10-table-skel"><SkeletonTable rows={4} label="Loading contacts (example)" /></div></div>
      <div className="sg-card"><Label>route loading · the shell outline (app/app/loading.tsx)</Label>
        <div className="sg-m10-app"><AppSkeleton frame="contained" label="Loading Corral (example)" /></div></div>
    </div>
  );
}
