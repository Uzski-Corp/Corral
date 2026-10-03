/**
 * The signed-in workspace (server/app/api/v1/routes/workspace.py):
 *
 *   GET   /api/v1/workspace                         -> WorkspaceOut
 *   PATCH /api/v1/workspace                         -> WorkspaceOut
 *   POST  /api/v1/workspace/logo     multipart file -> WorkspaceOut
 *         415 unsupported · 413 too_large · 503 storage_unconfigured · 502 storage_failed
 *   POST  /api/v1/workspace/site     { url }        -> WorkspaceOut
 *         422 url_invalid | url_not_public | site_unreachable
 *
 * WorkOS organizations have no logo. The file goes to R2 when those keys are set.
 * Site pages and highlights are what the API fetched, not sample copy.
 */
import { err, ok, type Result } from "../result";
import type { ApiClient } from "./client";
import { field, isBoolean, isNonEmptyString, isOptionalString, isRecord, isString } from "./decode";
import type { ApiError } from "./errors";

export const WORKSPACE_PATHS = {
  workspace: "/api/v1/workspace",
  logo: "/api/v1/workspace/logo",
  picture: "/api/v1/workspace/picture",
  site: "/api/v1/workspace/site",
} as const;

export const SITE_TIMEOUT_MS = 25_000;
export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

export type SitePage = { path: string; title: string };
/** A pending invite. `invitedAt` (ISO) is when it was first added; older invites have none. */
export type WorkspaceInvite = { email: string; role: "admin" | "member" | "viewer"; invitedAt?: string };
export type WorkspaceProduct = { id: string; name: string; description: string | null };
export type Workspace = {
  id: string;
  name: string;
  slug: string;
  timezone: string | null;
  teamSize: "solo" | "small" | "sales" | null;
  logoUrl: string | null;
  website: string | null;
  onboarded: boolean;
  skipped: number[];
  sitePages: SitePage[];
  siteHighlights: string[];
  invites: WorkspaceInvite[];
  product: WorkspaceProduct | null;
};

const TEAMS = ["solo", "small", "sales"] as const;
const ROLES = ["admin", "member", "viewer"] as const;

function strings(v: unknown, path: string): Result<string[], string> {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return err(`${path}: expected a list of strings`);
  return ok(v);
}

function numbers(v: unknown, path: string): Result<number[], string> {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "number")) return err(`${path}: expected a list of numbers`);
  return ok(v);
}

function pagesOf(v: unknown): Result<SitePage[], string> {
  if (!Array.isArray(v)) return err("workspace.site_pages: expected a list");
  const pages: SitePage[] = [];
  for (const item of v) {
    if (!isRecord(item)) return err("workspace.site_pages: expected objects");
    const path = field(item, "path", isString, "string", "site_page");
    if (!path.ok) return path;
    const title = field(item, "title", isString, "string", "site_page");
    if (!title.ok) return title;
    pages.push({ path: path.value, title: title.value });
  }
  return ok(pages);
}

function invitesOf(v: unknown): Result<WorkspaceInvite[], string> {
  if (!Array.isArray(v)) return err("workspace.invites: expected a list");
  const invites: WorkspaceInvite[] = [];
  for (const item of v) {
    if (!isRecord(item)) return err("workspace.invites: expected objects");
    const email = field(item, "email", isString, "string", "invite");
    if (!email.ok) return email;
    const role = field(item, "role", (x): x is WorkspaceInvite["role"] => typeof x === "string" && (ROLES as readonly string[]).includes(x), "a role", "invite");
    if (!role.ok) return role;
    const at = item.invited_at;
    invites.push({ email: email.value, role: role.value, ...(typeof at === "string" ? { invitedAt: at } : {}) });
  }
  return ok(invites);
}

function productOf(v: unknown): Result<WorkspaceProduct | null, string> {
  if (v === null) return ok(null);
  if (!isRecord(v)) return err("workspace.product: expected an object or null");
  const id = field(v, "id", isNonEmptyString, "string", "product");
  if (!id.ok) return id;
  const name = field(v, "name", isString, "string", "product");
  if (!name.ok) return name;
  const description = field(v, "description", isOptionalString, "string or null", "product");
  if (!description.ok) return description;
  return ok({ id: id.value, name: name.value, description: description.value ?? null });
}

export const decodeWorkspace = (input: unknown): Result<Workspace, string> => {
  if (!isRecord(input)) return err("workspace: expected an object");
  const id = field(input, "id", isNonEmptyString, "string", "workspace");
  if (!id.ok) return id;
  const name = field(input, "name", isString, "string", "workspace");
  if (!name.ok) return name;
  const slug = field(input, "slug", isString, "string", "workspace");
  if (!slug.ok) return slug;
  const timezone = field(input, "timezone", isOptionalString, "string or null", "workspace");
  if (!timezone.ok) return timezone;
  const team = field(input, "team_size", (v): v is Workspace["teamSize"] => v === null || (typeof v === "string" && (TEAMS as readonly string[]).includes(v)), "solo, small, sales or null", "workspace");
  if (!team.ok) return team;
  const logo = field(input, "logo_url", isOptionalString, "string or null", "workspace");
  if (!logo.ok) return logo;
  const website = field(input, "website", isOptionalString, "string or null", "workspace");
  if (!website.ok) return website;
  const onboarded = field(input, "onboarded", isBoolean, "boolean", "workspace");
  if (!onboarded.ok) return onboarded;
  const skipped = numbers(input.skipped, "workspace.skipped");
  if (!skipped.ok) return skipped;
  const sitePages = pagesOf(input.site_pages);
  if (!sitePages.ok) return sitePages;
  const highlights = strings(input.site_highlights, "workspace.site_highlights");
  if (!highlights.ok) return highlights;
  const invites = invitesOf(input.invites);
  if (!invites.ok) return invites;
  const product = productOf(input.product);
  if (!product.ok) return product;
  return ok({
    id: id.value, name: name.value, slug: slug.value,
    timezone: timezone.value ?? null, teamSize: team.value, logoUrl: logo.value ?? null, website: website.value ?? null,
    onboarded: onboarded.value, skipped: skipped.value, sitePages: sitePages.value, siteHighlights: highlights.value,
    invites: invites.value, product: product.value,
  });
};

export type WorkspaceUpdate = {
  name?: string;
  slug?: string;
  timezone?: string;
  team_size?: string;
  skipped?: number[];
  /** The whole pending list. Only email and role are sent: the server keeps each invite's time. */
  invites?: Pick<WorkspaceInvite, "email" | "role">[];
  complete?: boolean;
};

export type WorkspaceApi = {
  get(signal?: AbortSignal): Promise<Result<Workspace, ApiError>>;
  update(body: WorkspaceUpdate, signal?: AbortSignal): Promise<Result<Workspace, ApiError>>;
  uploadLogo(file: Blob & { name?: string }, signal?: AbortSignal): Promise<Result<Workspace, ApiError>>;
  uploadPicture(file: Blob & { name?: string }, signal?: AbortSignal): Promise<Result<{ pictureUrl: string }, ApiError>>;
  readSite(url: string, signal?: AbortSignal): Promise<Result<Workspace, ApiError>>;
};

function decodePicture(input: unknown): Result<{ pictureUrl: string }, string> {
  if (!isRecord(input)) return err("picture: expected an object");
  const url = field(input, "profile_picture_url", isNonEmptyString, "string", "picture");
  if (!url.ok) return url;
  return ok({ pictureUrl: url.value });
}

export function createWorkspaceApi(client: ApiClient): WorkspaceApi {
  return {
    get: (signal) => client.request(WORKSPACE_PATHS.workspace, { decode: decodeWorkspace, signal }),
    update: (body, signal) => client.request(WORKSPACE_PATHS.workspace, {
      method: "PATCH", decode: decodeWorkspace, signal,
      body: body.invites ? { ...body, invites: body.invites.map(({ email, role }) => ({ email, role })) } : body,
    }),
    uploadLogo(file, signal) {
      const form = new FormData();
      form.append("file", file, file.name ?? "logo");
      return client.request(WORKSPACE_PATHS.logo, { method: "POST", form, decode: decodeWorkspace, signal, timeoutMs: 60_000 });
    },
    uploadPicture(file, signal) {
      const form = new FormData();
      form.append("file", file, file.name ?? "photo");
      return client.request(WORKSPACE_PATHS.picture, { method: "POST", form, decode: decodePicture, signal, timeoutMs: 60_000 });
    },
    readSite: (url, signal) => client.request(WORKSPACE_PATHS.site, { method: "POST", body: { url }, decode: decodeWorkspace, signal, timeoutMs: SITE_TIMEOUT_MS }),
  };
}
