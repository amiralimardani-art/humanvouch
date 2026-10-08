# HumanVouch — Plan 01: ZK Attestation Circuit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Plan series:** This is plan 01 of 5. The successor plans were never written as documents; none of them
> exists in `docs/superpowers/plans/`:
>
> - 02 Soroban contracts (not present)
> - 03 enrollment + API (not present)
> - 04 Nuxt UI (not present)
> - 05 stretch: X adapter + NFT (not present)
>
> **Superseded:** plans 02–05 were replaced by `docs/superpowers/specs/2026-06-29-bls12381-onchain-addendum.md`,
> which moved the on-chain build to BLS12-381 and the API to Nuxt/Nitro server routes. The project scope
> (MUST/SHOULD/CUT) is in §8 of `docs/superpowers/specs/2026-06-27-humanvouch-design.md`; it is not a plan index.
>
> This plan is self-contained and ends with a working, locally-verifiable Groth16 proof of anonymous unique-human content attestation.

**Goal:** Build and locally verify a Circom/Groth16 circuit proving "a committed identity is a member of a Poseidon Merkle registry, and a content-bound nullifier is correctly derived" — without revealing the identity.

**Architecture:** A `MerkleProof` template computes a Poseidon Merkle root from a leaf + path; the top-level `Attestation` template hashes the identity secret to a commitment, proves its membership, and derives `nullifierHash = Poseidon(identitySecret, contentHash)`. Public signals: `root`, `nullifierHash` (outputs) and `contentHash` (input). Private: `identitySecret`, `pathElements`, `pathIndices`. A shared JS lib computes the same values off-circuit (for enrollment, proof-gen, and tests).

**Tech Stack:** Circom 2 + circomlib (Poseidon, MultiMux1) + snarkjs (Groth16 setup/prove/verify) + circomlibjs (off-circuit Poseidon + tree) + circom_tester + Vitest. Node ESM. Yarn 4 workspace `packages/circuits`.

## Global Constraints

- **Monorepo:** Yarn 4 workspaces + Turborepo; this package is `@humanvouch/circuits`. (Templated read-only from `ScarlettPlattform/scarlett-hub`; never modify that repo.)
- **Node ESM** (`"type": "module"`) — matches template convention.
- **Merkle depth:** fixed at `20` across the whole project (circuit, enrollment, proof-gen). Do not vary per task.
- **Field:** BN254 (Circom default). `contentHash` is a single field element = `SHA-256(canonical content)` interpreted as a big-endian integer **reduced mod the BN254 scalar field prime** `r = 21888242871839275222246405745257275088548364400416034343698204186575808495617`.
- **Hash:** Poseidon everywhere (commitment, nullifier, Merkle nodes). Never mix in keccak/sha inside the circuit.
- **Commitment:** `commitment = Poseidon([identitySecret])` (1 input).
- **Nullifier:** `nullifierHash = Poseidon([identitySecret, contentHash])` (2 inputs).
- **Empty-leaf default:** unused tree leaves = `0` (field zero). Internal zeros are precomputed by hashing up.
- **TDD:** every task is red→green→commit. Frequent commits.

---

## File Structure

- Create: `packages/circuits/package.json` — workspace manifest + scripts/deps.
- Create: `packages/circuits/circuits/merkle.circom` — `MerkleProof(DEPTH)` template.
- Create: `packages/circuits/circuits/attestation.circom` — `Attestation(DEPTH)` + `main`.
- Create: `packages/circuits/lib/poseidon.js` — async singleton Poseidon + field helpers.
- Create: `packages/circuits/lib/identity.js` — commitment, nullifier, `hashToField`.
- Create: `packages/circuits/lib/merkleTree.js` — Poseidon Merkle tree (insert, root, proof).
- Create: `packages/circuits/scripts/build.sh` — compile + trusted setup + export vkey.
- Create: `packages/circuits/scripts/genProof.js` — build witness + Groth16 fullProve.
- Test: `packages/circuits/test/identity.test.js` — lib unit tests.
- Test: `packages/circuits/test/merkleTree.test.js` — tree unit tests.
- Test: `packages/circuits/test/attestation.test.js` — circuit constraint + proof round-trip tests.

---

## Task 1: Workspace scaffold for `@humanvouch/circuits`

**Files:**
- Create: `packages/circuits/package.json`
- Create: `packages/circuits/vitest.config.js`

**Interfaces:**
- Consumes: nothing.
- Produces: a runnable Yarn workspace with `yarn workspace @humanvouch/circuits test` wired to Vitest; deps `circomlib`, `circomlibjs`, `snarkjs`, `circom_tester`, `vitest` installed.

- [ ] **Step 1: Create the package manifest**

Create `packages/circuits/package.json`:

```json
{
  "name": "@humanvouch/circuits",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "bash scripts/build.sh",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "circomlib": "^2.0.5",
    "circomlibjs": "^0.1.7",
    "snarkjs": "^0.7.5"
  },
  "devDependencies": {
    "circom_tester": "^0.0.20",
    "vitest": "^4.0.18"
  }
}
```

- [ ] **Step 2: Create the Vitest config**

Create `packages/circuits/vitest.config.js`:

```js
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.js"],
    testTimeout: 120000, // circuit compile + proof gen is slow
    hookTimeout: 120000,
  },
});
```

- [ ] **Step 3: Install dependencies**

Run (from repo root): `yarn install`
Expected: `@humanvouch/circuits` resolves; `node_modules/.bin/circom_tester` and `snarkjs` present. (Circom the compiler is a Rust binary — install separately in Task 6; circom_tester bundles a wasm path for tests.)

- [ ] **Step 4: Verify the test runner boots**

Run: `yarn workspace @humanvouch/circuits test`
Expected: Vitest runs with "No test files found" (exit 0 or the "no tests" notice). This confirms wiring before any test exists.

- [ ] **Step 5: Commit**

```bash
git add packages/circuits/package.json packages/circuits/vitest.config.js
git commit -m "chore(circuits): scaffold @humanvouch/circuits workspace"
```

---

## Task 2: Poseidon singleton + field helpers (`lib/poseidon.js`)

**Files:**
- Create: `packages/circuits/lib/poseidon.js`
- Test: `packages/circuits/test/identity.test.js` (created here, extended in Task 3)

**Interfaces:**
- Produces:
  - `async function getPoseidon(): Promise<{ hash(inputs: bigint[]): bigint, F }>` — `hash` returns the Poseidon hash as a `bigint`; `F` is the circomlibjs field object.
  - `const FIELD_PRIME: bigint` — the BN254 scalar field prime `r`.

- [ ] **Step 1: Write the failing test**

Create `packages/circuits/test/identity.test.js`:

```js
import { describe, it, expect } from "vitest";
import { getPoseidon, FIELD_PRIME } from "../lib/poseidon.js";

describe("poseidon", () => {
  it("hashes a single input deterministically to a field element", async () => {
    const p = await getPoseidon();
    const a = p.hash([1n]);
    const b = p.hash([1n]);
    expect(a).toBe(b);
    expect(a).toBeTypeOf("bigint");
    expect(a).toBeLessThan(FIELD_PRIME);
    expect(a).not.toBe(1n);
  });

  it("is sensitive to input order for two inputs", async () => {
    const p = await getPoseidon();
    expect(p.hash([1n, 2n])).not.toBe(p.hash([2n, 1n]));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @humanvouch/circuits test test/identity.test.js`
Expected: FAIL — cannot find module `../lib/poseidon.js`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/circuits/lib/poseidon.js`:

```js
import { buildPoseidon } from "circomlibjs";

export const FIELD_PRIME =
  21888242871839275222246405745257275088548364400416034343698204186575808495617n;

let _poseidon = null;

export async function getPoseidon() {
  if (_poseidon) return _poseidon;
  const poseidon = await buildPoseidon();
  const F = poseidon.F;
  _poseidon = {
    F,
    hash(inputs) {
      // poseidon() returns a field element in Montgomery form; F.toObject -> bigint
      const out = poseidon(inputs.map((x) => F.e(x)));
      return F.toObject(out);
    },
  };
  return _poseidon;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @humanvouch/circuits test test/identity.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/circuits/lib/poseidon.js packages/circuits/test/identity.test.js
git commit -m "feat(circuits): poseidon singleton and BN254 field prime"
```

---

## Task 3: Identity helpers — commitment, nullifier, hashToField (`lib/identity.js`)

**Files:**
- Create: `packages/circuits/lib/identity.js`
- Test: `packages/circuits/test/identity.test.js` (extend)

**Interfaces:**
- Consumes: `getPoseidon`, `FIELD_PRIME` from `lib/poseidon.js`.
- Produces:
  - `async function commitment(identitySecret: bigint): Promise<bigint>` = `Poseidon([identitySecret])`.
  - `async function nullifierHash(identitySecret: bigint, contentHash: bigint): Promise<bigint>` = `Poseidon([identitySecret, contentHash])`.
  - `function hashToField(bytes: Uint8Array | Buffer): bigint` — `SHA-256(bytes)` as big-endian bigint mod `FIELD_PRIME`.

- [ ] **Step 1: Write the failing test**

Append to `packages/circuits/test/identity.test.js`:

```js
import { commitment, nullifierHash, hashToField } from "../lib/identity.js";

describe("identity", () => {
  it("commitment is Poseidon([secret]) and hides the secret", async () => {
    const c = await commitment(42n);
    const { getPoseidon } = await import("../lib/poseidon.js");
    const p = await getPoseidon();
    expect(c).toBe(p.hash([42n]));
    expect(c).not.toBe(42n);
  });

  it("nullifier binds secret AND content (different content => different nullifier)", async () => {
    const n1 = await nullifierHash(42n, 100n);
    const n2 = await nullifierHash(42n, 101n);
    const n3 = await nullifierHash(43n, 100n);
    expect(n1).not.toBe(n2);
    expect(n1).not.toBe(n3);
    expect(await nullifierHash(42n, 100n)).toBe(n1); // deterministic
  });

  it("hashToField is deterministic and inside the field", async () => {
    const enc = new TextEncoder();
    const h = hashToField(enc.encode("hello world"));
    expect(h).toBe(hashToField(enc.encode("hello world")));
    expect(h).toBeLessThan(FIELD_PRIME);
    expect(h).not.toBe(hashToField(enc.encode("hello worlD")));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @humanvouch/circuits test test/identity.test.js`
Expected: FAIL — cannot find module `../lib/identity.js`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/circuits/lib/identity.js`:

```js
import { createHash } from "node:crypto";
import { getPoseidon, FIELD_PRIME } from "./poseidon.js";

export async function commitment(identitySecret) {
  const p = await getPoseidon();
  return p.hash([identitySecret]);
}

export async function nullifierHash(identitySecret, contentHash) {
  const p = await getPoseidon();
  return p.hash([identitySecret, contentHash]);
}

export function hashToField(bytes) {
  const digest = createHash("sha256").update(Buffer.from(bytes)).digest(); // 32 bytes
  const asBig = BigInt("0x" + digest.toString("hex"));
  return asBig % FIELD_PRIME;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @humanvouch/circuits test test/identity.test.js`
Expected: PASS (5 tests total in file).

- [ ] **Step 5: Commit**

```bash
git add packages/circuits/lib/identity.js packages/circuits/test/identity.test.js
git commit -m "feat(circuits): commitment, content-bound nullifier, hashToField"
```

---

## Task 4: Poseidon Merkle tree (`lib/merkleTree.js`)

**Files:**
- Create: `packages/circuits/lib/merkleTree.js`
- Test: `packages/circuits/test/merkleTree.test.js`

**Interfaces:**
- Consumes: `getPoseidon` from `lib/poseidon.js`.
- Produces:
  - `async function buildTree(leaves: bigint[], depth = 20): Promise<Tree>`
  - `Tree.root: bigint`
  - `Tree.proof(leafIndex: number): { pathElements: bigint[], pathIndices: number[] }` — `pathIndices[i]` is 0 if the running node is the **left** child at level `i`, else 1.
- These are the exact inputs the circuit's `pathElements` / `pathIndices` consume in Task 5.

- [ ] **Step 1: Write the failing test**

Create `packages/circuits/test/merkleTree.test.js`:

```js
import { describe, it, expect } from "vitest";
import { getPoseidon } from "../lib/poseidon.js";
import { buildTree } from "../lib/merkleTree.js";

describe("merkleTree", () => {
  it("recomputes the root from a member's proof", async () => {
    const p = await getPoseidon();
    const leaves = [11n, 22n, 33n, 44n];
    const tree = await buildTree(leaves, 20);
    const { pathElements, pathIndices } = tree.proof(2); // leaf 33n

    // Re-walk the path exactly as the circuit will.
    let node = 33n;
    for (let i = 0; i < pathElements.length; i++) {
      node =
        pathIndices[i] === 0
          ? p.hash([node, pathElements[i]])
          : p.hash([pathElements[i], node]);
    }
    expect(node).toBe(tree.root);
  });

  it("a non-member proof does not reproduce the root", async () => {
    const p = await getPoseidon();
    const tree = await buildTree([11n, 22n, 33n, 44n], 20);
    const { pathElements, pathIndices } = tree.proof(0);
    let node = 999n; // wrong leaf
    for (let i = 0; i < pathElements.length; i++) {
      node =
        pathIndices[i] === 0
          ? p.hash([node, pathElements[i]])
          : p.hash([pathElements[i], node]);
    }
    expect(node).not.toBe(tree.root);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @humanvouch/circuits test test/merkleTree.test.js`
Expected: FAIL — cannot find module `../lib/merkleTree.js`.

- [ ] **Step 3: Write minimal implementation**

Create `packages/circuits/lib/merkleTree.js`:

```js
import { getPoseidon } from "./poseidon.js";

// Fixed-depth binary Merkle tree over Poseidon, zero-filled.
export async function buildTree(leaves, depth = 20) {
  const p = await getPoseidon();

  // Precompute zero subtree roots per level.
  const zeros = [0n];
  for (let i = 1; i <= depth; i++) zeros[i] = p.hash([zeros[i - 1], zeros[i - 1]]);

  // Level 0 = padded leaves.
  let level = leaves.slice();
  const layers = [level];
  for (let d = 0; d < depth; d++) {
    const cur = layers[d];
    const next = [];
    for (let i = 0; i < cur.length; i += 2) {
      const left = cur[i];
      const right = i + 1 < cur.length ? cur[i + 1] : zeros[d];
      next.push(p.hash([left, right]));
    }
    if (next.length === 0) next.push(zeros[d + 1]);
    layers.push(next);
  }

  const root = layers[depth][0];

  function proof(leafIndex) {
    const pathElements = [];
    const pathIndices = [];
    let idx = leafIndex;
    for (let d = 0; d < depth; d++) {
      const cur = layers[d];
      const isRight = idx % 2 === 1;
      const siblingIdx = isRight ? idx - 1 : idx + 1;
      const sibling = siblingIdx < cur.length ? cur[siblingIdx] : zeros[d];
      pathElements.push(sibling);
      pathIndices.push(isRight ? 1 : 0);
      idx = Math.floor(idx / 2);
    }
    return { pathElements, pathIndices };
  }

  return { root, proof, depth };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `yarn workspace @humanvouch/circuits test test/merkleTree.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/circuits/lib/merkleTree.js packages/circuits/test/merkleTree.test.js
git commit -m "feat(circuits): zero-filled poseidon merkle tree with proofs"
```

---

## Task 5: The Circom circuit (`merkle.circom` + `attestation.circom`)

**Files:**
- Create: `packages/circuits/circuits/merkle.circom`
- Create: `packages/circuits/circuits/attestation.circom`
- Test: `packages/circuits/test/attestation.test.js`

**Interfaces:**
- Consumes: `lib/identity.js`, `lib/merkleTree.js` (to build witness inputs in the test).
- Produces: a compiled circuit whose witness exposes public signals `root`, `nullifierHash` (outputs) and `contentHash` (public input). Private inputs: `identitySecret`, `pathElements[20]`, `pathIndices[20]`.

- [ ] **Step 1: Write the failing test**

Create `packages/circuits/test/attestation.test.js`:

```js
import { describe, it, expect, beforeAll } from "vitest";
import { wasm as wasmTester } from "circom_tester";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { commitment, nullifierHash } from "../lib/identity.js";
import { buildTree } from "../lib/merkleTree.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const circuitPath = path.join(here, "../circuits/attestation.circom");

describe("attestation circuit", () => {
  let circuit;
  beforeAll(async () => {
    circuit = await wasmTester(circuitPath, { include: ["node_modules"] });
  });

  it("computes root and nullifier for a valid member", async () => {
    const secret = 12345n;
    const contentHash = 67890n;
    const c = await commitment(secret);
    const tree = await buildTree([c, 2n, 3n, 4n], 20);
    const { pathElements, pathIndices } = tree.proof(0);

    const w = await circuit.calculateWitness(
      {
        identitySecret: secret,
        pathElements,
        pathIndices,
        contentHash,
      },
      true
    );
    await circuit.checkConstraints(w);

    // Public outputs land at fixed witness positions; assert via the helper.
    await circuit.assertOut(w, {
      root: tree.root,
      nullifierHash: await nullifierHash(secret, contentHash),
    });
  });

  it("a non-member produces a root that differs from the registry root", async () => {
    const secret = 999n;
    const contentHash = 1n;
    const realMember = await commitment(111n);
    const tree = await buildTree([realMember, 2n, 3n, 4n], 20);
    const { pathElements, pathIndices } = tree.proof(0); // path for realMember

    // Feed the wrong secret with someone else's path: circuit still computes A root,
    // but it must NOT equal the registry root (membership is not satisfied).
    const w = await circuit.calculateWitness(
      { identitySecret: secret, pathElements, pathIndices, contentHash },
      true
    );
    const outRoot = w[1]; // output signal order: [1]=root, [2]=nullifierHash (see assertOut mapping)
    expect(outRoot).not.toBe(tree.root);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @humanvouch/circuits test test/attestation.test.js`
Expected: FAIL — `attestation.circom` not found / compile error.

- [ ] **Step 3: Write the Merkle template**

Create `packages/circuits/circuits/merkle.circom`:

```circom
pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "circomlib/circuits/mux1.circom";

// Recompute a Poseidon merkle root from a leaf and its inclusion path.
// pathIndices[i] == 0  => running node is the LEFT child at level i
// pathIndices[i] == 1  => running node is the RIGHT child at level i
template MerkleProof(DEPTH) {
    signal input leaf;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];
    signal output root;

    signal hashes[DEPTH + 1];
    hashes[0] <== leaf;

    component mux[DEPTH];
    component hasher[DEPTH];

    for (var i = 0; i < DEPTH; i++) {
        // enforce boolean index
        pathIndices[i] * (1 - pathIndices[i]) === 0;

        mux[i] = MultiMux1(2);
        mux[i].c[0][0] <== hashes[i];        // left  when index = 0
        mux[i].c[0][1] <== pathElements[i];  // left  when index = 1
        mux[i].c[1][0] <== pathElements[i];  // right when index = 0
        mux[i].c[1][1] <== hashes[i];        // right when index = 1
        mux[i].s <== pathIndices[i];

        hasher[i] = Poseidon(2);
        hasher[i].inputs[0] <== mux[i].out[0];
        hasher[i].inputs[1] <== mux[i].out[1];

        hashes[i + 1] <== hasher[i].out;
    }

    root <== hashes[DEPTH];
}
```

- [ ] **Step 4: Write the top-level circuit**

Create `packages/circuits/circuits/attestation.circom`:

```circom
pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";
include "./merkle.circom";

template Attestation(DEPTH) {
    // private
    signal input identitySecret;
    signal input pathElements[DEPTH];
    signal input pathIndices[DEPTH];
    // public input
    signal input contentHash;
    // public outputs
    signal output root;
    signal output nullifierHash;

    component commitmentHasher = Poseidon(1);
    commitmentHasher.inputs[0] <== identitySecret;

    component merkle = MerkleProof(DEPTH);
    merkle.leaf <== commitmentHasher.out;
    for (var i = 0; i < DEPTH; i++) {
        merkle.pathElements[i] <== pathElements[i];
        merkle.pathIndices[i] <== pathIndices[i];
    }
    root <== merkle.root;

    component nullifierHasher = Poseidon(2);
    nullifierHasher.inputs[0] <== identitySecret;
    nullifierHasher.inputs[1] <== contentHash;
    nullifierHash <== nullifierHasher.out;
}

component main {public [contentHash]} = Attestation(20);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `yarn workspace @humanvouch/circuits test test/attestation.test.js`
Expected: PASS (2 tests). If `circuit.assertOut` reports a witness-index mismatch, read the printed signal map and adjust the `w[1]` index in test 2 to the reported `main.root` position (output order is `root` then `nullifierHash`).

- [ ] **Step 6: Commit**

```bash
git add packages/circuits/circuits/merkle.circom packages/circuits/circuits/attestation.circom packages/circuits/test/attestation.test.js
git commit -m "feat(circuits): attestation circuit (merkle membership + content nullifier)"
```

---

## Task 6: Build script — compile + Groth16 trusted setup (`scripts/build.sh`)

**Files:**
- Create: `packages/circuits/scripts/build.sh`
- Modify: `packages/circuits/.gitignore` (create) — ignore `build/` artifacts except the vkey.

**Interfaces:**
- Consumes: `circuits/attestation.circom`.
- Produces (in `packages/circuits/build/`): `attestation.r1cs`, `attestation_js/attestation.wasm`, `attestation_final.zkey`, `verification_key.json`. Plan 02 (Soroban) and Plan 03 (proof-gen) consume `attestation.wasm`, `attestation_final.zkey`, and `verification_key.json`.

> Prereq: the Circom **compiler** (Rust binary) must be installed and on PATH. Install once:
> `cargo install --git https://github.com/iden3/circom.git` (or download a release binary). Verify: `circom --version` (expect 2.1.x).

- [ ] **Step 1: Write the build script**

Create `packages/circuits/scripts/build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

BUILD=build
POT_POWER=15   # ~32k constraints headroom; depth-20 poseidon circuit is well under this
SNARKJS="yarn snarkjs"

mkdir -p "$BUILD"

echo "==> Compiling circuit"
circom circuits/attestation.circom --r1cs --wasm --sym -l node_modules -o "$BUILD"

echo "==> Circuit info"
$SNARKJS r1cs info "$BUILD/attestation.r1cs"

echo "==> Powers of Tau (phase 1)"
$SNARKJS powersoftau new bn128 "$POT_POWER" "$BUILD/pot_0.ptau" -v
$SNARKJS powersoftau contribute "$BUILD/pot_0.ptau" "$BUILD/pot_1.ptau" --name="hv-1" -v -e="humanvouch entropy 1"
$SNARKJS powersoftau prepare phase2 "$BUILD/pot_1.ptau" "$BUILD/pot_final.ptau" -v

echo "==> Groth16 setup (phase 2)"
$SNARKJS groth16 setup "$BUILD/attestation.r1cs" "$BUILD/pot_final.ptau" "$BUILD/attestation_0.zkey"
$SNARKJS zkey contribute "$BUILD/attestation_0.zkey" "$BUILD/attestation_final.zkey" --name="hv-2" -v -e="humanvouch entropy 2"
$SNARKJS zkey export verificationkey "$BUILD/attestation_final.zkey" "$BUILD/verification_key.json"

echo "==> Done. Artifacts in $BUILD/"
```

- [ ] **Step 2: Make it executable and create .gitignore**

Run: `chmod +x packages/circuits/scripts/build.sh`

Create `packages/circuits/.gitignore`:

```
build/*
!build/verification_key.json
```

- [ ] **Step 3: Run the build**

Run: `yarn workspace @humanvouch/circuits build`
Expected: ends with "Done. Artifacts in build/"; `packages/circuits/build/attestation_js/attestation.wasm`, `build/attestation_final.zkey`, and `build/verification_key.json` exist.
(If `circom: command not found`, install the compiler per the prereq above, then re-run.)

- [ ] **Step 4: Verify artifacts**

Run: `ls packages/circuits/build/attestation_js/attestation.wasm packages/circuits/build/attestation_final.zkey packages/circuits/build/verification_key.json`
Expected: all three paths listed, no error.

- [ ] **Step 5: Commit**

```bash
git add packages/circuits/scripts/build.sh packages/circuits/.gitignore packages/circuits/build/verification_key.json
git commit -m "feat(circuits): groth16 trusted-setup build script + committed vkey"
```

---

## Task 7: End-to-end proof generation + verification (`scripts/genProof.js`)

**Files:**
- Create: `packages/circuits/scripts/genProof.js`
- Test: `packages/circuits/test/proof.test.js`

**Interfaces:**
- Consumes: `build/attestation_js/attestation.wasm`, `build/attestation_final.zkey`, `build/verification_key.json`, plus `lib/identity.js` + `lib/merkleTree.js`.
- Produces:
  - `async function generateAttestationProof({ identitySecret, contentHash, leaves, leafIndex, depth=20 }): Promise<{ proof, publicSignals }>` — Plan 03's API imports this exact function to produce the on-chain payload.
  - `async function verifyAttestationProof(proof, publicSignals): Promise<boolean>`.

- [ ] **Step 1: Write the failing test**

Create `packages/circuits/test/proof.test.js`:

```js
import { describe, it, expect } from "vitest";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { commitment } from "../lib/identity.js";
import { generateAttestationProof, verifyAttestationProof } from "../scripts/genProof.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const built = existsSync(path.join(here, "../build/attestation_final.zkey"));

describe.runIf(built)("groth16 proof round-trip", () => {
  it("verifies a valid attestation and rejects a tampered public signal", async () => {
    const secret = 7777n;
    const contentHash = 424242n;
    const member = await commitment(secret);
    const leaves = [member, 2n, 3n, 4n];

    const { proof, publicSignals } = await generateAttestationProof({
      identitySecret: secret,
      contentHash,
      leaves,
      leafIndex: 0,
    });

    expect(await verifyAttestationProof(proof, publicSignals)).toBe(true);

    const tampered = [...publicSignals];
    tampered[0] = (BigInt(tampered[0]) + 1n).toString(); // flip root
    expect(await verifyAttestationProof(proof, tampered)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `yarn workspace @humanvouch/circuits test test/proof.test.js`
Expected: FAIL — cannot find module `../scripts/genProof.js`. (If the build artifacts are absent, the suite is skipped via `runIf`; run `yarn workspace @humanvouch/circuits build` first so the test actually executes.)

- [ ] **Step 3: Write minimal implementation**

Create `packages/circuits/scripts/genProof.js`:

```js
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";
import * as snarkjs from "snarkjs";
import { buildTree } from "../lib/merkleTree.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const WASM = path.join(here, "../build/attestation_js/attestation.wasm");
const ZKEY = path.join(here, "../build/attestation_final.zkey");
const VKEY = path.join(here, "../build/verification_key.json");

export async function generateAttestationProof({
  identitySecret,
  contentHash,
  leaves,
  leafIndex,
  depth = 20,
}) {
  const tree = await buildTree(leaves, depth);
  const { pathElements, pathIndices } = tree.proof(leafIndex);

  const input = {
    identitySecret: identitySecret.toString(),
    contentHash: contentHash.toString(),
    pathElements: pathElements.map((x) => x.toString()),
    pathIndices: pathIndices.map((x) => x.toString()),
  };

  const { proof, publicSignals } = await snarkjs.groth16.fullProve(input, WASM, ZKEY);
  return { proof, publicSignals };
}

export async function verifyAttestationProof(proof, publicSignals) {
  const vkey = JSON.parse(await readFile(VKEY, "utf8"));
  return snarkjs.groth16.verify(vkey, publicSignals, proof);
}
```

- [ ] **Step 4: Build (if not already) then run test to verify it passes**

Run: `yarn workspace @humanvouch/circuits build && yarn workspace @humanvouch/circuits test test/proof.test.js`
Expected: PASS (1 test) — valid proof verifies `true`, tampered verifies `false`.

- [ ] **Step 5: Commit**

```bash
git add packages/circuits/scripts/genProof.js packages/circuits/test/proof.test.js
git commit -m "feat(circuits): end-to-end groth16 proof generation and verification"
```

---

## Task 8: Full suite green + package README

**Files:**
- Create: `packages/circuits/README.md`

**Interfaces:**
- Consumes: all prior tasks.
- Produces: documentation of the public API (`generateAttestationProof`, `verifyAttestationProof`, `buildTree`, `commitment`, `nullifierHash`, `hashToField`) and the build command, for Plans 02–03 to consume.

- [ ] **Step 1: Run the whole suite**

Run: `yarn workspace @humanvouch/circuits test`
Expected: all suites PASS (identity, merkleTree, attestation, proof).

- [ ] **Step 2: Write the README**

Create `packages/circuits/README.md`:

```markdown
# @humanvouch/circuits

Circom/Groth16 circuit proving anonymous unique-human content attestation.

## What it proves
Given a private `identitySecret` and a Poseidon Merkle registry, the circuit proves:
- `commitment = Poseidon([identitySecret])` is a member of the tree (output `root`), and
- `nullifierHash = Poseidon([identitySecret, contentHash])` is correctly derived.
Public signals: `root`, `nullifierHash`, `contentHash`. Nothing else is revealed.

## Build
Requires the Circom compiler on PATH (`circom --version` → 2.1.x).
`yarn workspace @humanvouch/circuits build`
Artifacts: `build/attestation_js/attestation.wasm`, `build/attestation_final.zkey`, `build/verification_key.json`.

## API
- `generateAttestationProof({ identitySecret, contentHash, leaves, leafIndex, depth=20 })` → `{ proof, publicSignals }`
- `verifyAttestationProof(proof, publicSignals)` → `boolean`
- `buildTree(leaves, depth=20)` → `{ root, proof(i), depth }`
- `commitment(secret)`, `nullifierHash(secret, contentHash)`, `hashToField(bytes)`

## Consumed by
- Plan 02 (Soroban): `verification_key.json` → on-chain Groth16 verifier.
- Plan 03 (API): `generateAttestationProof` → attestation payload; `hashToField` → canonical content hash.
```

- [ ] **Step 3: Commit**

```bash
git add packages/circuits/README.md
git commit -m "docs(circuits): package README and public API"
```

---

## Self-Review

**1. Spec coverage (this plan's slice of §4.2 + §6):**
- Circuit witness/public/predicate (spec §4.2) → Tasks 5, 7. ✓
- `nullifier = Poseidon(secret, contentHash)` semantics (spec §4.2) → Task 3 + Task 5. ✓
- Poseidon Merkle, depth 20 (spec §4.2) → Tasks 4, 5. ✓
- `contentHash` = SHA-256 mod BN254 (spec Global Constraints) → Task 3 `hashToField`. ✓
- Groth16 artifacts for the Soroban verifier (spec §4.2, §6) → Task 6 exports `verification_key.json`. ✓
- Circom + snarkjs + circomlib stack (spec §6) → Task 1. ✓
- Out of scope here (correctly deferred to later plans): on-chain verify (Plan 02), enrollment script + API (Plan 03), normalization/adapters (Plan 03), UI (Plan 04).

**2. Placeholder scan:** No TBD/TODO; every code step contains complete code; commands have expected output. ✓

**3. Type consistency:** `generateAttestationProof`/`verifyAttestationProof` (Task 7) match the names referenced in Task 8 README and the Plan-03 interface note. `buildTree(leaves, depth)` → `{ root, proof }` consistent across Tasks 4, 5, 7. `commitment`/`nullifierHash`/`hashToField` signatures consistent across Tasks 3, 5, 7, 8. `pathIndices` convention (0=left,1=right) identical in `lib/merkleTree.js`, `merkle.circom`, and tests. ✓

**Note for executor:** Task 5 test 2 reads a public output at witness index `w[1]`; if circom_tester's signal map places `root` elsewhere, use the printed map to correct the index (called out inline in Task 5 Step 5).
