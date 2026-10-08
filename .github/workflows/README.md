# CI

## Required status check

Branch protection on `main` should require **one** check: `summary` (job in `ci.yml`).

`summary` needs every other job in `ci.yml`, runs with `if: always()`, writes a result table to the job
summary and fails unless every job it needs finished with `success` (a failed, cancelled or **skipped** job
fails it). When you add a job to `ci.yml`, add its id to `summary.needs`.
