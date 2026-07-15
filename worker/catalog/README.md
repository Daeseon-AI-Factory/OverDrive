# Reploom exercise catalog Worker

This directory is a deployment boundary separate from `overdrive-quicklog`. It has one public
route, `GET /catalog/v1`, one dedicated D1 binding, `CATALOG_DB`, and no secrets, cron, telemetry,
cookies, user context, AI calls, or public publication route.

The Worker serves the exact `catalog_release.payload_json` BLOB selected by
`catalog_channel('v1')`. It verifies published state, metadata bounds, envelope/version, exact byte
length, and SHA-256 before returning any release. On any mismatch it returns a non-cacheable 503;
it never falls forward to a draft or partially published release.

`wrangler.template.toml` deliberately contains a zero database id and disables `workers_dev`.
Create a dedicated D1 database, copy the template to a reviewed environment config, replace the
sentinel database id, and configure the reviewed public hostname before remote use. Do not point
this config at `overdrive-rank`, copy bindings from `worker/wrangler.toml`, or register these routes
in `worker/src/index.js`.

Publication is intentionally not an HTTP endpoint. `scripts/admin.mjs` invokes this repository's
installed Wrangler entry with Node (no shell or personal absolute path). Its default operation is a
non-mutating verification. It validates the canonical local artifact, reads the exact D1 BLOB and
all six normalized projections back in deterministic order, runs `foreign_key_check`, validates the
transition from the active channel, and confirms the draft generation did not move during those
reads. An explicit `publish` uses that generation and all release metadata as compare-and-swap
inputs, records one fixed publication timestamp, and moves the pointer only if every guard still
matches. An explicit `rollback` verifies both immutable payload checksums and changes only the
channel pointer.

The normalized projection stores the bounded `counting_convention` enum. Provenance is also
fail-closed: an `unreviewed` row must be `original_editorial` with method `none`, null reviewer,
evidence, and timestamp, and it cannot receive a row source. Source-checked and human-reviewed rows
must carry review identity and at least one exercise-specific source before publication; licensed
rows additionally require human review and a non-empty recorded license. General program/safety
references do not belong in `catalog_source` unless they were actually used for a row-specific
comparison.

## Local rehearsal

Run commands from `worker`. Use one persistence directory for the entire rehearsal:

```sh
node node_modules/wrangler/bin/wrangler.js d1 execute overdrive-catalog \
  --local --config catalog/wrangler.template.toml \
  --persist-to /tmp/overdrive-catalog-local \
  --file catalog/migrations/0001_catalog.sql

node node_modules/wrangler/bin/wrangler.js d1 execute overdrive-catalog \
  --local --config catalog/wrangler.template.toml \
  --persist-to /tmp/overdrive-catalog-local \
  --file ../assets/catalog/exercise-catalog-v1.d1.sql

# Default command is read-only verification.
node catalog/scripts/admin.mjs --local --persist-to /tmp/overdrive-catalog-local

# Mutation requires the explicit subcommand. Reuse the printed timestamp for any retry.
node catalog/scripts/admin.mjs publish --local \
  --persist-to /tmp/overdrive-catalog-local \
  --published-at-ms 1783987200000
```

Do not use `DELETE` to clear the channel between rehearsals; deletion is forbidden by the schema.
Use a fresh persistence directory for a fresh first-publication test.

## Reviewed remote operation

Remote mode always requires an explicitly supplied, reviewed config. Verification remains the
default and performs no writes:

```sh
node catalog/scripts/admin.mjs verify --remote --config catalog/wrangler.production.toml

node catalog/scripts/admin.mjs publish --remote \
  --config catalog/wrangler.production.toml \
  --published-at-ms 1783987200000

node catalog/scripts/admin.mjs rollback --remote \
  --config catalog/wrangler.production.toml \
  --expected-current-version 1.0.1 \
  --expected-current-checksum sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb \
  --target-version 1.0.0 \
  --target-checksum sha256:43491e64b66fbd16f87325d8e8ea9e5d2325d888b71c700b61b80da19566604a
```

Before a remote mutation, archive the successful verification output, exact artifact checksum,
reviewed config diff, and fixed timestamp. After a publish or rollback, the CLI performs a second
readback and exits non-zero unless the expected pointer and immutable release are visible. For any
release after the first, also pass `--expected-current-version` to `publish`. Replace the
illustrative rollback version/checksum values with the archived exact values.

Treat remote draft import, verification, and publication as a single-writer maintenance operation.
Do not run a generated import or any manual D1 write concurrently with `admin.mjs`: generated draft
prep deliberately deletes/recreates only an unpublished version for deterministic idempotence, so
the generation CAS protects in-place mutations but is not a distributed release lock.

## Tests

Run all Worker tests from the repository's `worker` directory:

```sh
cd worker
npm test
```
