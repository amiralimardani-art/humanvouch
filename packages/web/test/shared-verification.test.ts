import { readFileSync } from "node:fs";
import { parse } from "@vue/compiler-sfc";
import { compile, createSSRApp } from "vue";
import { renderToString } from "@vue/server-renderer";
import { describe, expect, it } from "vitest";

const { descriptor, errors } = parse(readFileSync(new URL("../app.vue", import.meta.url), "utf8"));
if (errors.length) throw errors[0];
function findSharedSection(node: any): string | undefined {
  if (node.tag === "section" && node.props?.some((prop: any) => prop.name === "if" && prop.exp?.content === "shareView")) {
    return node.loc.source;
  }
  for (const child of node.children ?? []) {
    const found = findSharedSection(child);
    if (found) return found;
  }
}
const section = findSharedSection(descriptor.template!.ast);
if (!section) throw new Error("Shared verification section not found in the actual app template");
const render = compile(section);
async function html(shareView: unknown) {
  return renderToString(createSSRApp({
    setup: () => ({ shareView, cfg: { attestContractId: "test-contract" } }), render,
  }));
}

describe("shared verification states", () => {
  it("shows an escaped resolution error instead of an unattested result", async () => {
    const result = await html({ loading: false, hashField: "1", error: "RPC failed <retry>" });
    expect(result).toContain('role="alert"');
    expect(result).toContain("RPC failed &lt;retry&gt;");
    expect(result).not.toContain("Not yet vouched");
    expect(result).not.toContain("unique verified human(s)");
  });
  it("does not display a stale zero count when resolution failed", async () => {
    const result = await html({ loading: false, hashField: "1", count: 0, error: "Network unavailable" });
    expect(result).toContain("Network unavailable");
    expect(result).not.toContain("Not yet vouched");
  });
  it("preserves the successful zero-vouch state", async () => {
    const result = await html({ loading: false, hashField: "1", count: 0 });
    expect(result).toContain("Not yet vouched");
    expect(result).not.toContain('role="alert"');
  });
  it("preserves positive vouch results and stored content", async () => {
    const result = await html({ loading: false, hashField: "1", count: 3, content: "Fixture article" });
    expect(result).toContain("Human-Vouched");
    expect(result).toContain("Fixture article");
    expect(result).not.toContain("Not yet vouched");
  });
  it("keeps loading distinct from results and errors", async () => {
    const result = await html({ loading: true, hashField: "1", count: 0, error: "stale error" });
    expect(result).toContain("Resolving on-chain");
    expect(result).not.toContain("Not yet vouched");
    expect(result).not.toContain("stale error");
  });
  it("hides the section without a shared verification request", async () => {
    expect(await html(null)).not.toContain("Content credential");
  });
});
