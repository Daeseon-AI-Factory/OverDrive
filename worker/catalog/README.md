# Reploom exercise catalog Worker

This directory is a deployment boundary separate from `overdrive-quicklog`. It has one public
route, `GET /catalog/v1`, one dedicated D1 binding, `CATALOG_DB`, and no secrets, cron, telemetry,
cookies, user context, AI calls, or public publication route.

The Worker serves the exact `catalog_release.payload_json` BLOB selected by
`catalog_channel('v1')`. It verifies published state, metadata bounds, envelope/version, exact byte
length, and SHA-256 before returning any release. On any mismatch it returns a non-cacheable 503;
it never falls forward to a draft or partially published release.

`wrangler.template.toml` deliberately contains a zero database id and disables `workers_dev`. A
later reviewed infrastructure change must create a dedicated D1 database, replace that sentinel,
configure the reviewed public hostname, apply
`migrations/0001_catalog.sql`, and use immutable Worker version upload/promotion. Do not point this
config at `overdrive-rank`, copy bindings from `worker/wrangler.toml`, or register these routes in
`worker/src/index.js`.

Publication is intentionally not an HTTP endpoint. Future release tooling must validate the full
contract before one transaction changes a draft to `published` and updates the `v1` channel
pointer. Rollback updates only that pointer to a previous published version; the migration prevents
published payload/projection mutation and deletion.

Run all Worker tests from the parent directory:

```sh
cd worker
npm test
```
