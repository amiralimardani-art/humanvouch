import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FR, contentToField } from "../server/utils/chain";

const getVouchesOnChain = vi.fn();
const cfg = { attestContractId: "C1", readSourcePublicKey: "GREAD", rpcUrl: "https://x.invalid", networkPassphrase: "t" };

beforeEach(() => {
  vi.stubGlobal("defineEventHandler", (h: unknown) => h);
  vi.stubGlobal("useRuntimeConfig", () => ({ public: cfg }));
  vi.stubGlobal("getQuery", (e: any) => e.query);
  vi.stubGlobal("getHeader", (e: any) => e.payment);
  vi.stubGlobal("setResponseStatus", (e: any, s: number) => { e.status = s; });
  vi.stubGlobal("FR", FR);
  vi.stubGlobal("contentToField", contentToField);
  vi.stubGlobal("getVouchesOnChain", getVouchesOnChain);
  getVouchesOnChain.mockReset().mockResolvedValue(2);
});
afterEach(() => vi.unstubAllGlobals());

async function call(query: Record<string, unknown>, payment?: string) {
  const { default: handler } = await import("../server/api/v1/attestation.get");
  const event: any = { query, payment, status: 200 };
  const body = await handler(event);
  return { status: event.status, body };
}
import { MAX_CONTENT_BYTES } from "../lib/shared/limits";

describe("content length cap", () => {
  it("returns 413 above the limit without hashing or reading the chain", async () => {
    const spy = vi.fn(contentToField);
    vi.stubGlobal("contentToField", spy);
    const r = await call({ content: "x".repeat(MAX_CONTENT_BYTES + 1) }, "receipt");
    expect(r.status).toBe(413);
    expect(r.body).toMatchObject({ code: "CONTENT_TOO_LARGE" });
    expect(spy).not.toHaveBeenCalled();
    expect(getVouchesOnChain).not.toHaveBeenCalled();
  });

  it("counts UTF-8 bytes, not characters", async () => {
    const r = await call({ content: "é".repeat(MAX_CONTENT_BYTES / 2 + 1) }, "receipt");
    expect(r.status).toBe(413);
  });

  it("processes content at the limit as before", async () => {
    const r = await call({ content: "x".repeat(MAX_CONTENT_BYTES) }, "receipt");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ humanVouches: 2 });
  });
});
