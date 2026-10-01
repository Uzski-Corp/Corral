"use client";
/**
 * The data layer for the signed-in app: typed API clients plus the signed-in person, provided by
 * <AppScreen> once /me has confirmed the session. Views read it with useAppData():
 *
 * - present → the view loads from the API (with Bau's loading / empty / error states);
 * - null    → the view renders Bau's sample data. That's the styleguide, the design-review build,
 *             any `?state=` review state, and component tests that don't provide one.
 */
import { createContext, useContext, type ReactNode } from "react";
import { displayName, kbApiFor, leadsApiFor, type KbApi, type LeadsApi, type Me } from "@/lib/api";
import { getConfig, type ClientConfig } from "@/lib/config";
import type { Person } from "@/lib/kb/map";

export type AppData = {
  kb: KbApi;
  /** Companies, people, segments and CSV import (ENG-81). */
  leads: LeadsApi;
  me: Me;
  /** The signed-in person as the mappers name them ("Added by Wanjiru Mwangi"). */
  person: Person;
};

const Ctx = createContext<AppData | null>(null);

export const useAppData = () => useContext(Ctx);

export function AppDataProvider({ value, children }: { value: AppData | null; children: ReactNode }) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function appDataFor(me: Me, config: ClientConfig = getConfig(), apis: Partial<Pick<AppData, "kb" | "leads">> = {}): AppData {
  return { kb: apis.kb ?? kbApiFor(config), leads: apis.leads ?? leadsApiFor(config), me, person: { id: me.user.id, name: displayName(me.user) } };
}
