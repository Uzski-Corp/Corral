"use client";
/**
 * Products: what onboarding saved, plus anything added afterwards.
 * Without a signed-in session the shell keeps the milestone placeholder.
 */
import { useEffect, useState } from "react";
import { useAppData } from "@/components/session/AppData";
import type { Product } from "@/lib/api/kb";
import { errorDetail } from "@/lib/api/errors";
import { FormField, TextInput, Textarea } from "../Form";
import { Icon } from "../icons";
import { Dialog } from "../Overlays";
import { Button } from "../primitives";
import { EmptyState, ErrorState, Skeleton } from "../States";
import { useToast } from "../Toaster";
import "./products.css";

function sourcesOf(n: number | null) {
  if (n == null) return null;
  if (n === 0) return "No sources yet";
  return `${n.toLocaleString("en-GB")} ${n === 1 ? "source" : "sources"}`;
}

export function ProductsView({ adding, onAddingChange, onOpen, onChanged }: {
  adding: boolean;
  onAddingChange(open: boolean): void;
  onOpen(id: string): void;
  /** The knowledge switcher keeps its own list; tell it to load again after a create. */
  onChanged?(): void;
}) {
  const data = useAppData();
  const toast = useToast();
  const [attempt, setAttempt] = useState(0);
  const [phase, setPhase] = useState<"loading" | "ready" | "error">("loading");
  const [detail, setDetail] = useState<string | undefined>();
  const [products, setProducts] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [pitch, setPitch] = useState("");
  const [nameErr, setNameErr] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);

  // Opening the form starts it blank (state adjusted during render, not in an effect).
  const [wasAdding, setWasAdding] = useState(adding);
  if (adding !== wasAdding) {
    setWasAdding(adding);
    if (adding) { setName(""); setPitch(""); setNameErr(undefined); }
  }

  useEffect(() => {
    if (!data) return;
    const c = new AbortController();
    void data.kb.listProducts(c.signal).then((r) => {
      if (c.signal.aborted) return;
      if (!r.ok) {
        if (r.error.kind === "aborted") return;
        setDetail(errorDetail(r.error));
        setPhase("error");
        return;
      }
      setProducts([...r.value].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
      setPhase("ready");
    });
    return () => c.abort();
  }, [data, attempt]);

  async function add() {
    const trimmed = name.trim();
    if (!trimmed) { setNameErr("Name the thing you sell. Corral scores every company against it."); return; }
    if (!data) return;
    setNameErr(undefined);
    setSaving(true);
    const description = pitch.trim();
    const r = await data.kb.createProduct({ name: trimmed, ...(description ? { description } : {}) });
    setSaving(false);
    if (!r.ok) {
      if (r.error.kind === "http" && r.error.code === "name_taken") {
        setNameErr("A product with this name already exists.");
        return;
      }
      toast({ tone: "error", children: r.error.message });
      return;
    }
    setProducts((list) => [...list, r.value].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    onAddingChange(false);
    onChanged?.();
    toast({ tone: "success", children: `Added ${r.value.name}` });
  }

  if (!data) return null;
  const n = products.length;

  return (
    <div className="c-view">
      {phase === "loading" && (
        <div className="p-skel" role="status" aria-label="Loading products">
          <Skeleton w={120} h={12} />
          <Skeleton w="70%" h={14} />
          <Skeleton w="46%" h={12} />
        </div>
      )}
      {phase === "error" && (
        <div className="c-view c-view--center">
          <ErrorState title="Couldn’t load products" detail={detail} actions={<Button variant="primary" onClick={() => { setPhase("loading"); setAttempt((x) => x + 1); }}><Icon name="refresh" />Try again</Button>}>
            The product you added during setup is still stored.
          </ErrorState>
        </div>
      )}
      {phase === "ready" && n === 0 && (
        <div className="c-view c-view--center">
          <EmptyState icon="box" title="No products yet" actions={<Button variant="primary" onClick={() => onAddingChange(true)}><Icon name="plus" />Add a product</Button>}>
            Name the thing you sell. Corral scores every company against it.
          </EmptyState>
        </div>
      )}
      {phase === "ready" && n > 0 && (
        <div className="p-list">
          <p className="p-sum"><b>{n} {n === 1 ? "product" : "products"}</b> · each one gets its own fit score</p>
          <div className="p-rows">
            {products.map((p) => {
              const sources = sourcesOf(p.sourceCount);
              return (
                <button key={p.id} type="button" className="p-row" onClick={() => onOpen(p.id)}>
                  <span className="p-tile" aria-hidden="true"><Icon name="box" size={14} /></span>
                  <span className="p-copy">
                    <span className="p-name">{p.name}</span>
                    {p.description && <span className="p-pitch">{p.description}</span>}
                  </span>
                  {sources && <span className="p-meta">{sources}</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}
      <Dialog open={adding} onClose={() => { if (!saving) onAddingChange(false); }} width={440}
        title="Add a product"
        description="Corral scores every company against this."
        footer={<><Button onClick={() => onAddingChange(false)} disabled={saving}>Cancel</Button><Button variant="primary" onClick={() => void add()} disabled={saving}>{saving ? "Adding" : "Add"}</Button></>}>
        <FormField label="Product name" error={nameErr}>
          <TextInput value={name} placeholder="ColdTrace Sensors" onChange={(e) => { setName(e.target.value); setNameErr(undefined); }} autoFocus />
        </FormField>
        <FormField label="What it does, in one sentence" optional help="Plain words beat taglines. This is what the copilot quotes back to prospects.">
          <Textarea rows={2} value={pitch} placeholder="Wireless temperature and door sensors that page the right person the minute a cold room drifts." onChange={(e) => setPitch(e.target.value)} />
        </FormField>
      </Dialog>
    </div>
  );
}
