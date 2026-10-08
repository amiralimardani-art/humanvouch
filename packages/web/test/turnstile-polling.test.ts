import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { compileScript, parse } from "@vue/compiler-sfc";
import { transformSync } from "esbuild";
import { ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Compile the real script setup. Stub Nuxt auto-imports and widget API;
// no mounted callback, external script, CAPTCHA token or chain call is run.
const { descriptor, errors } = parse(readFileSync(new URL("../app.vue", import.meta.url), "utf8"));
if (errors.length) throw errors[0];
const script = compileScript(descriptor, { id: "polling-test" });
const { code } = transformSync(script.content, { loader: "ts", format: "cjs" });
const module = { exports: {} as any };
new Function("require", "module", "exports", code)(createRequire(import.meta.url), module, module.exports);
const component = module.exports.default;
let context: any;
let windowStub: any;
let unmount: Array<() => void>;

beforeEach(() => {
  vi.useFakeTimers();
  windowStub = {};
  unmount = [];
  vi.stubGlobal("window", windowStub);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("useRuntimeConfig", () => ({ public: {} }));
  vi.stubGlobal("useRoute", () => ({ query: {} }));
  vi.stubGlobal("useHead", vi.fn());
  vi.stubGlobal("onMounted", vi.fn());
  vi.stubGlobal("onUnmounted", (callback: () => void) => unmount.push(callback));
  context = component.setup({}, { expose() {} });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Turnstile script polling", () => {
  it("stops after 15 seconds with a load error if the API never arrives", () => {
    context.turnstileEl.value = {};
    context.renderTurnstile();
    vi.advanceTimersByTime(15_000);
    expect(context.humanErr.value).toContain("could not load");
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("also bounds retries when the target element never appears", () => {
    windowStub.turnstile = { render: vi.fn() };
    context.renderTurnstile();
    vi.advanceTimersByTime(15_000);
    expect(context.humanErr.value).toContain("could not load");
    expect(windowStub.turnstile.render).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("clears the pending timeout on component unmount", () => {
    context.renderTurnstile();
    expect(vi.getTimerCount()).toBe(1);
    expect(unmount).toHaveLength(1);
    unmount.forEach(callback => callback());
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(60_000);
    expect(context.humanErr.value).toBe("");
  });
  it("renders once when the script becomes available before the deadline", () => {
    context.turnstileEl.value = {};
    context.renderTurnstile();
    vi.advanceTimersByTime(900);
    windowStub.turnstile = { render: vi.fn() };
    vi.advanceTimersByTime(300);
    expect(windowStub.turnstile.render).toHaveBeenCalledTimes(1);
    expect(context.humanErr.value).toBe("");
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not poll when the human is already verified", () => {
    context.humanVerified.value = true;
    context.renderTurnstile();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("does not render an existing widget twice", () => {
    context.turnstileEl.value = {};
    windowStub.turnstile = { render: vi.fn() };
    context.renderTurnstile();
    context.renderTurnstile();
    expect(windowStub.turnstile.render).toHaveBeenCalledTimes(1);
  });
  it("stops a pending retry if verification completes in the meantime", () => {
    context.renderTurnstile();
    context.humanVerified.value = true;
    vi.advanceTimersByTime(300);
    expect(vi.getTimerCount()).toBe(0);
    expect(context.humanErr.value).toBe("");
  });
});
