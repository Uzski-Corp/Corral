/* The waitlist contract (Bau, Oct 7; Krak builds the endpoint in the corral-landing Worker).

   POST /api/waitlist
     JSON (the form with JS):  { "email": string, "source": "v1" | "v2" | "v3" | "v4" | "home" }
       201 { "status": "joined" }            new address
       200 { "status": "exists" }            already on the list (409 is read the same way)
       400 or 422 { "error": "invalid_email" }
       anything else, or a network failure: the form shows its error state
     Form post (JS off): application/x-www-form-urlencoded, fields `email` and `source`.
       Answer 303 to the page it came from (Referer, same origin only) with a fragment:
       #waitlist-joined, #waitlist-exists, #waitlist-invalid or #waitlist-error. The page shows the matching line with
       CSS :target, so it reads right with no script.

   In development the request is mocked in the browser (no route exists in the Next app): 700ms, then
     an address containing "taken" or one already sent this session → exists; "fail" → error; else joined.
   Turn the mock off with NEXT_PUBLIC_WAITLIST_MOCK=0; force it on a build with NEXT_PUBLIC_WAITLIST_MOCK=1. */

export type WaitlistSource = "v1" | "v2" | "v3" | "v4" | "home";
export type WaitlistResult = "joined" | "exists" | "invalid" | "error";
export const WAITLIST_ENDPOINT = "/api/waitlist";
export const WAITLIST_FRAGMENTS: Record<WaitlistResult, string> = {
  joined: "waitlist-joined", exists: "waitlist-exists", invalid: "waitlist-invalid", error: "waitlist-error",
};

/** Deliberately plain: one @, something before it, a dot in the domain, no spaces. The server decides the rest. */
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

const mockOn = () => {
  const flag = process.env.NEXT_PUBLIC_WAITLIST_MOCK;
  return flag === "1" || (flag !== "0" && process.env.NODE_ENV === "development");
};

async function mock(email: string): Promise<WaitlistResult> {
  await new Promise((r) => setTimeout(r, 700));
  const key = "corral-waitlist-mock";
  const seen: string[] = JSON.parse(sessionStorage.getItem(key) ?? "[]");
  const e = email.toLowerCase();
  if (e.includes("fail")) return "error";
  if (e.includes("taken") || seen.includes(e)) return "exists";
  sessionStorage.setItem(key, JSON.stringify([...seen, e]));
  return "joined";
}

export async function joinWaitlist(email: string, source: WaitlistSource): Promise<WaitlistResult> {
  const clean = email.trim();
  if (!isEmail(clean)) return "invalid";
  if (mockOn()) return mock(clean);
  try {
    const res = await fetch(WAITLIST_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ email: clean, source }),
    });
    if (res.status === 400 || res.status === 422) return "invalid";
    if (res.status === 409) return "exists";
    if (!res.ok) return "error";
    const body = (await res.json().catch(() => ({}))) as { status?: string };
    return body.status === "exists" ? "exists" : "joined";
  } catch {
    return "error";
  }
}
