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

describe("single-valued parameters", () => {
  it.each([{ content: ["a", "b"] }, { hash: ["1", "2"] }])("rejects %j with 400 before any chain read", async (q) => {
    const r = await call(q, "receipt");
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: "MULTIPLE_VALUES" });
    expect(getVouchesOnChain).not.toHaveBeenCalled();
  });

  it("still answers a single content value", async () => {
    const r = await call({ content: "hello" }, "receipt");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ humanVouches: 2 });
  });
});
