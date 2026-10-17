import { afterEach, describe, expect, it, vi } from "vitest";
import { AUTOSEND_SEND_URL, sendMail, type Mail } from "../src/mail";

const mail: Mail = {
  to: { email: "w@acme.co", name: "Wanjiru" }, from: { email: "hello@uzskicorp.agency", name: "Corral" }, replyTo: { email: "corral@uzskicorp.agency" },
  templateId: "A-tpl", dynamicData: { first_name: "Wanjiru" },
};
afterEach(() => vi.restoreAllMocks());

describe("sendMail", () => {
  it("posts the template and dynamicData to AutoSend with the bearer key", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 200 }));
    expect(await sendMail({ AUTOSEND_API_KEY: "k" }, mail, fetcher as unknown as typeof fetch)).toBe("sent");
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(AUTOSEND_SEND_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ authorization: "Bearer k", "content-type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(mail);
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
  it("skips without a key or a template id, without calling out", async () => {
    const fetcher = vi.fn();
    expect(await sendMail({}, mail, fetcher as unknown as typeof fetch)).toBe("skipped");
    expect(await sendMail({ AUTOSEND_API_KEY: "k" }, { ...mail, templateId: "" }, fetcher as unknown as typeof fetch)).toBe("skipped");
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("reports a refusal with the status only, never the address", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await sendMail({ AUTOSEND_API_KEY: "k" }, mail, (async () => new Response("bad w@acme.co", { status: 401 })) as unknown as typeof fetch)).toBe("failed");
    expect(err).toHaveBeenCalledWith("mail: AutoSend refused the send", 401);
    expect(JSON.stringify(err.mock.calls)).not.toContain("acme");
  });
  it("reports a network failure or a timeout as failed, logging only the error name", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = (async () => { throw new TypeError("connect w@acme.co"); }) as unknown as typeof fetch;
    expect(await sendMail({ AUTOSEND_API_KEY: "k" }, mail, boom)).toBe("failed");
    expect(err).toHaveBeenLastCalledWith("mail: AutoSend send failed", "TypeError");
    expect(await sendMail({ AUTOSEND_API_KEY: "k" }, mail, (async () => { throw "weird"; }) as unknown as typeof fetch)).toBe("failed");
    expect(err).toHaveBeenLastCalledWith("mail: AutoSend send failed", "error");
    expect(JSON.stringify(err.mock.calls)).not.toContain("acme");
  });
  it("uses the global fetch by default", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    expect(await sendMail({ AUTOSEND_API_KEY: "k" }, mail)).toBe("sent");
    expect(spy).toHaveBeenCalledOnce();
  });
});
