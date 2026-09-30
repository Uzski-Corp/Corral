"use client";
/**
 * Search your sources (M11, gap 2). POST …/search → SearchHit {passageId, sourceId, sourceName, sourceKind,
 * loc, text, score}. 8 hits first, "Show more" once to the API's 20. While a query is on, the results take
 * the list's place; clearing it brings the list back. States: nothing searchable yet (field disabled),
 * loading (three skeleton rows), no results, error (Try again + the failed request in mono), results.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { SearchHit } from "@/lib/api/kb";
import type { ApiError } from "@/lib/api/errors";
import { errorDetail } from "@/lib/api/errors";
import { plainPassage } from "@/lib/kb/passages";
import { SEARCH_LIMIT, SEARCH_MAX, SEARCH_MIN } from "@/lib/kb/upload";
import type { Result } from "@/lib/result";
import { TextInput } from "../Form";
import { Icon } from "../icons";
import { Button } from "../primitives";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { FileTile, PassageLabel } from "./parts";

export type KbSearchFn = (query: string, limit: number, signal?: AbortSignal) => Promise<Result<SearchHit[], ApiError>>;
export type SearchState = { phase: "idle" } | { phase: "loading"; query: string } | { phase: "error"; query: string; detail: string }
  | { phase: "done"; query: string; hits: SearchHit[]; limit: number };

/** Plain terms of a query, for marking matches in a passage (the API ranks by meaning; this is only a hint). */
export const termsOf = (q: string) => Array.from(new Set(q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []));
export function mark(text: string, terms: string[]): ReactNode[] {
  if (!terms.length) return [text];
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
}

export function KbSearch({ search, searchable, onOpen, onAdd, initial, children }: {
  search: KbSearchFn;
  /** Passages Corral can search now; 0 disables the field (nothing's been read yet). */
  searchable: number;
  onOpen: (sourceId: string) => void; onAdd?: () => void;
  /** Review states: start with this query and state (no request made). */
  initial?: { query: string; state: SearchState };
  children: ReactNode;
}) {
  const [query, setQuery] = useState(initial?.query ?? "");
  const [st, setSt] = useState<SearchState>(initial?.state ?? { phase: "idle" });
  const ctl = useRef<AbortController | null>(null);
  const frozen = useRef(!!initial);

  const run = (q: string, limit: number) => {
    frozen.current = false;
    ctl.current?.abort();
    const c = new AbortController(); ctl.current = c;
    setSt((s) => (s.phase === "done" && s.query === q ? s : { phase: "loading", query: q }));
    void search(q, limit, c.signal).then((r) => {
      if (c.signal.aborted) return;
      setSt(r.ok ? { phase: "done", query: q, hits: r.value, limit } : r.error.kind === "aborted" ? { phase: "idle" } : { phase: "error", query: q, detail: errorDetail(r.error) });
    });
  };
  // Search as you type, after a short pause.
  useEffect(() => {
    if (frozen.current) return;
    const q = query.trim();
    if (q.length < SEARCH_MIN) return;
    const t = setTimeout(() => run(q, SEARCH_LIMIT), 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);
  useEffect(() => () => ctl.current?.abort(), []);

  const clear = () => { frozen.current = false; setQuery(""); setSt({ phase: "idle" }); };
  const off = searchable === 0;
  const q = query.trim();
  return (
    <>
      <div className="k-search" role="search">
        <TextInput icon="search" type="search" aria-label="Search your sources" placeholder={off ? "Searchable once a source is read" : "Search what Corral read, like “battery life”"}
          value={query} disabled={off} onChange={(e) => {
            frozen.current = false; setQuery(e.target.value);
            if (e.target.value.trim().length < SEARCH_MIN) { ctl.current?.abort(); setSt({ phase: "idle" }); }
          }}
          onKeyDown={(e) => { if (e.key === "Escape" && query) { e.preventDefault(); clear(); } }}
          suffix={query ? <button type="button" className="c-iconbtn k-search__x" aria-label="Clear search" onClick={clear}><Icon name="x" size={12} /></button> : undefined} />
        {!off && st.phase === "idle" && <span className="k-search__hint">{searchable.toLocaleString("en-GB")} passages · the same search Corral uses when it writes</span>}
      </div>
      {st.phase === "idle" ? children : (
        <section className="k-results" aria-label={`Search results for ${st.query}`} aria-busy={st.phase === "loading" || undefined}>
          {st.phase === "loading" && (
            <div role="status" aria-label={`Searching for ${st.query}`}>
              {[0, 1, 2].map((i) => <div key={i} className="k-hit k-hit--skel"><Skeleton w={20} h={20} r={5} /><span className="k-skel2"><Skeleton w="36%" h={10} /><Skeleton w="94%" h={11} /><Skeleton w={`${58 + i * 11}%`} h={11} /></span></div>)}
            </div>
          )}
          {st.phase === "error" && (
            <ErrorState title="Couldn’t search your sources" detail={st.detail} actions={<Button variant="primary" onClick={() => run(st.query, SEARCH_LIMIT)}><Icon name="refresh" />Try again</Button>}>
              Your sources are fine; the search didn’t answer. Corral’s emails aren’t affected.
            </ErrorState>
          )}
          {st.phase === "done" && st.hits.length === 0 && (
            <EmptyState compact icon="search" title={<>Nothing in your sources matches “{st.query}”</>}
              actions={<><Button onClick={clear}>Clear search</Button>{onAdd && <Button onClick={onAdd}><Icon name="plus" />Add sources</Button>}</>}>
              Try fewer or different words. If it’s something you sell, add a source that covers it.
            </EmptyState>
          )}
          {st.phase === "done" && st.hits.length > 0 && (
            <>
              <p className="k-results__sum" role="status"><b>{st.hits.length} {st.hits.length === 1 ? "passage" : "passages"}</b> closest to “{st.query}”</p>
              <ol className="k-hits">
                {st.hits.map((h) => (
                  <li key={h.passageId}>
                    <button type="button" className="k-hit" onClick={() => onOpen(h.sourceId)}>
                      <FileTile kind={h.sourceKind} size={20} />
                      <span className="k-hit__body">
                        <span className="k-hit__src"><b>{h.sourceName}</b>{h.loc && <PassageLabel loc={h.loc} ordinal={0} inert />}</span>
                        <span className="k-hit__txt">{mark(plainPassage(h.text, h.loc ?? undefined), termsOf(q || st.query))}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              {st.hits.length >= st.limit && st.limit < SEARCH_MAX && <div className="k-results__more"><Button onClick={() => run(st.query, SEARCH_MAX)}>Show more</Button></div>}
              {st.limit >= SEARCH_MAX && st.hits.length >= SEARCH_MAX && <p className="k-results__cap">These are the {SEARCH_MAX} closest passages. Add a word or two to find others.</p>}
            </>
          )}
        </section>
      )}
    </>
  );
}
