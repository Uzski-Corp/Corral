"use client";
/**
 * Live onboarding: the workspace, the first product and the site read are stored on the API.
 * A new browser that already finished setup is sent to the app.
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Onboarding, type OnboardingSeed, type OnboardingSnap } from "@/components/app/screens/Onboarding";
import { kbApiFor, workspaceApiFor, type Me } from "@/lib/api";
import type { ApiError } from "@/lib/api/errors";
import { LOGO_MAX_BYTES, type Workspace } from "@/lib/api/workspace";
import { markOnboarded } from "@/lib/auth/cookies";
import { useSession } from "./SessionProvider";

const LOGO_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

function problem(e: ApiError): string {
  return e.message;
}

function resume(w: Workspace) {
  const skipped = w.skipped.filter((n) => n >= 3 && n <= 5);
  const done = [w.product ? 1 : 0, w.product ? 2 : 0, w.sitePages.length ? 3 : 0, w.invites.length ? 5 : 0].filter((n) => n > 0);
  const step = [1, 2, 3, 4, 5].find((n) => !done.includes(n) && !skipped.includes(n)) ?? 6;
  return { step, done, skipped };
}

function seedOf(w: Workspace): OnboardingSeed {
  return {
    name: w.name, slug: w.slug, tz: w.timezone ?? "nbo", team: w.teamSize ?? "small",
    product: w.product?.name ?? "", pitch: w.product?.description ?? "", site: w.website ?? "",
    logoUrl: w.logoUrl, pages: w.sitePages, highlights: w.siteHighlights,
    invites: w.invites.map((i) => [i.email, i.role]),
  };
}

export function PersistentOnboarding({ me }: { me: Me }) {
  const session = useSession();
  const router = useRouter();
  const config = session?.config;
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [ready, setReady] = useState(false);
  const productId = useRef<string | null>(null);

  useEffect(() => {
    if (!config) return;
    const c = new AbortController();
    void workspaceApiFor(config).get(c.signal).then((r) => {
      if (c.signal.aborted) return;
      if (r.ok && r.value.onboarded) {
        markOnboarded();
        router.replace("/app");
        return;
      }
      if (r.ok) {
        productId.current = r.value.product?.id ?? null;
        setWorkspace(r.value);
      } else {
        setWorkspace({
          id: me.organization.id, name: me.organization.name, slug: me.organization.slug,
          timezone: null, teamSize: null, logoUrl: null, website: null, onboarded: false,
          skipped: [], sitePages: [], siteHighlights: [], invites: [], product: null,
        });
      }
      setReady(true);
    });
    return () => c.abort();
  }, [config, me.organization.id, me.organization.name, me.organization.slug, router]);

  if (!config || !ready || !workspace) {
    return <div className="s-onb c-app"><main className="s-onb__main"><p className="c-muted" style={{ padding: 28 }}>Loading your workspace</p></main></div>;
  }

  const api = workspaceApiFor(config);
  const kb = kbApiFor(config);
  const { step, done, skipped } = resume(workspace);

  const onSave = async (snap: OnboardingSnap) => {
    const saved = await api.update({
      ...(snap.name.trim() ? { name: snap.name.trim() } : {}),
      ...(snap.slug.trim() ? { slug: snap.slug.trim() } : {}),
      timezone: snap.tz,
      team_size: snap.team,
      skipped: snap.skipped,
      invites: snap.invites.filter(([email]) => email.trim()).map(([email, role]) => ({
        email: email.trim(),
        role: role === "admin" || role === "viewer" ? role : "member",
      })),
      complete: snap.complete,
    });
    if (!saved.ok) return problem(saved.error);
    if (!snap.product.trim()) return null;
    const description = snap.pitch.trim();
    if (productId.current) {
      const updated = await kb.updateProduct(productId.current, { name: snap.product.trim(), description });
      return updated.ok ? null : problem(updated.error);
    }
    const created = await kb.createProduct({ name: snap.product.trim(), ...(description ? { description } : {}) });
    if (created.ok) { productId.current = created.value.id; return null; }
    if (created.error.kind === "http" && created.error.code === "name_taken") {
      const list = await kb.listProducts();
      const existing = list.ok ? list.value.find((p) => p.name === snap.product.trim()) : undefined;
      if (!existing) return problem(created.error);
      productId.current = existing.id;
      const updated = await kb.updateProduct(existing.id, { description });
      return updated.ok ? null : problem(updated.error);
    }
    return problem(created.error);
  };

  return (
    <Onboarding
      initialStep={step}
      initialDone={done}
      skipped={skipped}
      live={{
        seed: seedOf(workspace),
        onSave,
        async onLogo(file) {
          if (file.size > LOGO_MAX_BYTES) return { error: "Logos can be up to 2 MB." };
          if (file.type && !LOGO_TYPES.includes(file.type)) return { error: "Use a PNG, JPEG, GIF or WebP." };
          const r = await api.uploadLogo(file);
          if (!r.ok) return { error: problem(r.error) };
          return { url: r.value.logoUrl ?? "" };
        },
        async onReadSite(url) {
          const r = await api.readSite(url);
          if (!r.ok) return { error: problem(r.error) };
          if (r.value.sitePages.length === 0) return { error: "That page had nothing Corral could read." };
          setWorkspace(r.value);
          return { pages: r.value.sitePages, highlights: r.value.siteHighlights };
        },
      }}
      onExit={() => markOnboarded()}
    />
  );
}
