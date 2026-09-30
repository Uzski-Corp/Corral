"use client";
/* A whole app screen for the marketing site (M10), in its own module so a page that only shows a screen
   doesn't load the other pieces, and the app itself loads only when a ProductFrame scrolls near. */
import dynamic from "next/dynamic";
import { AppSkeleton } from "@/components/app/States";
import type { UniboxReviewState } from "@/lib/unibox/state";
import type { LeadsReviewState } from "@/lib/leads/state";
import type { SequenceReviewState } from "@/lib/sequences/state";
import type { DiscoveryReviewState } from "@/lib/discovery/state";
import type { McpReviewState } from "@/lib/mcp/state";

/** The whole app, fetched only when a ProductFrame scrolls near (it already shows AppSkeleton until then). */
const AppDemo = dynamic(() => import("@/components/app/AppDemo").then((m) => m.AppDemo), { ssr: false, loading: () => <AppSkeleton frame="contained" label="Loading the sample workspace" /> });

/** A whole app screen, contained: the frame's width decides desktop or phone layout. */
export function Screen({ view, unibox, leads, sequences, discovery, developer }: {
  view: "unibox" | "companies" | "segments" | "sequences" | "discovery" | "settings";
  unibox?: UniboxReviewState; leads?: LeadsReviewState; sequences?: SequenceReviewState; discovery?: DiscoveryReviewState; developer?: McpReviewState;
}) {
  return <AppDemo frame="contained" hotkeys={false} initialView={view} unibox={unibox} leads={leads} sequences={sequences} discovery={discovery} developer={developer} />;
}

