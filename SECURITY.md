# Security Policy

## Status: hackathon demo on Stellar testnet

HumanVouch was built for Stellar Hacks: Real-World ZK. The deployment is a **demo**. Its contracts are
deployed on **Stellar testnet only** and hold **no real value**. Several controls are deliberately
weak so the demo runs without accounts or ceremonies. They are listed below so nobody mistakes them for
production security.

## Known demo-only controls

| Control | Where | Why it is not production-grade |
|---|---|---|
| Deterministic trusted setup | `packages/circuits/scripts/build.sh` (`-e="humanvouch entropy 1"`, `-e="humanvouch entropy 2"`) | The Powers of Tau and zkey contributions use fixed, public entropy, so anyone can reproduce the toxic waste and forge proofs. Production needs a real multi-party ceremony. |
| Turnstile test secret | `packages/web/server/api/verify-human.post.ts` (`1x0000000000000000000000000000000AA`) | This is Cloudflare's public always-pass test secret: the human check accepts every token. Production needs a real Turnstile secret (and, for unique personhood, World ID). |
| Public demo personhood registry | `packages/web/public/zk/registry.json` | The registry is operated by the project and published with the app. It stands in for World ID / passport-based personhood and does not prove uniqueness by itself. |
| Testnet-only contracts | `packages/web/nuxt.config.ts` (`attestContractId`, `rpcUrl`, `networkPassphrase`) and `docs/ONCHAIN-STATUS.md` | `AttestContract` and the Groth16 verifier run on Stellar testnet, which is reset periodically. Attestations there carry no economic weight. |
| Testnet x402 payments | `packages/web/server/api/v1/attestation.get.ts` | The x402 flow asks for testnet XLM. It demonstrates the protocol, not a revenue-bearing paywall. |

## Scope

**In scope** (please report):

- Flaws that would survive a production setup: circuit soundness bugs, nullifier or Merkle-root checks
  that can be bypassed in `AttestContract`, proof-encoding bugs, or server routes that leak secrets or
  accept unauthenticated state changes.
- Supply-chain issues in the build or deploy scripts.

**Out of scope** (already known, listed above):

- Forging proofs using the deterministic demo setup.
- Passing the human check with Turnstile test keys.
- Draining or resetting testnet accounts, or anything that depends on testnet being reset.

## Reporting a vulnerability

Please report privately through GitHub: open the repository's **Security** tab and choose
**Report a vulnerability** (private vulnerability reporting). Do not open a public issue for an
in-scope report. Include the affected file, steps to reproduce and the impact you expect.
