/**
 * The knowledge product switcher (M11, gap 10). ProductOut has no source count, and the client only lists
 * sources for the selected product, so a count is known for some products and not others. The switcher
 * never mixes a real number with a guess: a product shows "12 sources" when its count is known, and no
 * meta at all when it isn't (never "0", which would read as empty). With per-product counts from the API
 * (a Krak ask: `source_count` on ProductOut), every row fills in with no layout change.
 */
export type ProductRow = { id: string; label: string; checked: boolean; meta?: string };

export function productRows(products: readonly { id: string; name: string }[], selectedId: string | null | undefined,
  counts: Readonly<Record<string, number | undefined>> = {}): ProductRow[] {
  return products.map((p) => {
    const n = counts[p.id];
    return { id: p.id, label: p.name, checked: p.id === selectedId, ...(n != null ? { meta: `${n.toLocaleString("en-GB")} ${n === 1 ? "source" : "sources"}` } : {}) };
  });
}
