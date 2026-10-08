# Workflow conventions

Every workflow in this directory follows two rules:

1. **Concurrency.** A top-level block cancels a superseded run when a new commit lands on the same
   branch or pull request:

   ```yaml
   concurrency:
     group: ${{ github.workflow }}-${{ github.ref }}
     cancel-in-progress: true
   ```

2. **Timeouts.** Every job sets `timeout-minutes`, so a hung `yarn install` or `cargo build` cannot hold a
   runner for GitHub's six-hour default. Use 20 minutes unless the job needs more (the circuits suite
   compiles circuits with 120 s test timeouts, see `packages/circuits/vitest.config.js`).

Check new or edited workflows with [`actionlint`](https://github.com/rhysd/actionlint) before opening a PR.
