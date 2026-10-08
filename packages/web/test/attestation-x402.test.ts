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

describe("x402 challenge", () => {
  it("returns 402 with the documented accepts entry when X-Payment is missing", async () => {
    const r = await call({ content: "hello" });
    expect(r.status).toBe(402);
    expect(r.body).toMatchObject({ x402Version: 1 });
    const a = (r.body as any).accepts[0];
    expect(a).toMatchObject({ scheme: "exact", network: "stellar-testnet", maxAmountRequired: "100000", asset: "native" });
    expect(a.resource).toBe("/api/v1/attestation?hash=" + contentToField("hello").toString());
    expect(getVouchesOnChain).not.toHaveBeenCalled();
  });
});

describe("paid response", () => {
  it.each([[0, false], [2, true]])("count %i -> backedByHuman %s", async (count, backed) => {
    getVouchesOnChain.mockResolvedValue(count);
    const r = await call({ content: "hello" }, "receipt");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ humanVouches: count, backedByHuman: backed, contentHash: contentToField("hello").toString() });
  });
});
