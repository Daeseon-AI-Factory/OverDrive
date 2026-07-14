# Bundled exercise catalog v1

This directory contains product catalog metadata, not workout logs, health data,
or fabricated user data.

Authoritative editable source:

- `scripts/catalog/catalog-source.mjs`

Generated artifacts:

- `exercise-catalog-v1.json` — exact compact UTF-8 response/body bytes; no BOM or trailing newline.
- `exercise-catalog-v1.sha256` — `sha256:<lowercase hex>` plus one trailing newline.
- `exercise-catalog-v1.generated.ts` — exact raw/checksum constants for the bundled app fallback.
- `exercise-catalog-v1.coverage.json` — IDs behind each type, body region, equipment, and movement-pattern count.
- `exercise-catalog-v1.evidence.json` — source-check scope and primary references; explicitly not human review.
- `exercise-catalog-v1.d1.sql` — dedicated-D1 draft inserts only; it never updates `catalog_channel`.

Regenerate and verify with:

```sh
npm run catalog:prepare
npm run catalog:validate
```

The validator preserves the original 32 IDs at display order 1–32, checks the
frozen schema invariants and coverage matrix, compares exact bytes/checksum and
generated TypeScript values, runs search/typo conformance vectors, and proves
that representative corruptions fail. Publishing to a Worker or D1 is outside
these scripts.
