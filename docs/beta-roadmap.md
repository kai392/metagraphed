# Metagraphed Prod/Beta Roadmap

This document captures the strategic direction and the sequenced work to take
Metagraphed from its current state to a public beta. It is a planning artifact;
health, latency, completeness, and pool eligibility remain probe-/build-derived
only, exactly as in `docs/operations.md`.

## Context

Metagraphed is an unofficial operational registry for Bittensor subnet
interfaces, health, schemas, and access metadata — the builder-facing layer the
native metagraph lacks. The backend is schema-driven and deterministic
(JSON Schema → OpenAPI → TS types → client are all generated), uses tiered
storage (Git + Cloudflare R2 + KV) served by one Worker, is safety-bounded
(read-only probes, no credentials, gated UGC), and already covers all active
Finney netuids with adapter-backed pilots for Allways (SN7) and Gittensor (SN74).

Goals driving this roadmap:

1. Reach a credible public beta quickly.
2. Refocus on a defensible edge.
3. Strengthen the project as a candidate for gittensor emission-weighting — a
   polished public good that measurably serves the Bittensor subnet ecosystem.

Locked decisions:

- **Edge / moat:** coverage completeness, framed as _trustworthy, verified_
  completeness.
- **Frontend:** `metagraphed-ui` (separately owned) stays a **separate
  Cloudflare Worker** from the backend.
- **Beta differentiator:** enable the read-only RPC proxy (with Cloudflare WAF +
  rate limiting as prerequisites).

## Strategic Edge: Trustworthy Coverage Completeness

The headline differentiator is complete, verifiable, machine-readable coverage of
every Bittensor subnet's public builder interfaces — and the ability to _prove_
that completeness with provenance and live freshness. Existing dashboards
(taostats, taomarketcap, backprop, subnetradar) publish alpha/price/validator
analytics; the native metagraph publishes protocol state. None publish a
complete, verifiable builder-interface + health registry with a completeness
metric.

Completeness is only defensible if it is trustworthy, so the other product layers
are supporting pillars of the completeness story rather than separate bets:

- **Completeness** — the headline metric and public scoreboard.
- **Provenance** (evidence ledger) — proof the completeness is real, not asserted.
- **Freshness + health** — proof the completeness is current, not stale.
- **Adapter depth** (Gittensor / Allways) — the reference of what "complete" looks like.

The project should also be an exemplary, healthy, gittensor-registered repo, and
its Gittensor/Allways adapters should be pristine — they are the highest-traffic
subnets and demonstrate the product to the broader ecosystem.

## Findings (prioritized)

### P0 — Truth and data quality

1. **Gittensor (SN74) adapter ships degraded data.**
   `registry/adapters/latest/gittensor.json` currently shows `Bad credentials`
   (401), all 18 repos at `html-fallback` with `null` `pushed_at`/`open_issues_count`,
   and `captured_count: 0`. Root cause: the snapshot ran without a valid
   `GITHUB_TOKEN` (`scripts/snapshot-adapters.mjs` reads `process.env.GITHUB_TOKEN`).
   Fix token plumbing so the published adapter carries real repository metadata.
2. **Epoch-zero timestamps in published artifacts.** Deterministic builds stamp
   `1970-01-01T00:00:00.000Z` into `generated_at`/`verified_at`. This is correct
   for reproducibility but renders as "Jan 1 1970" to consumers and undercuts the
   freshness/completeness story. Add a real `published_at` / `as_of` field
   distinct from the deterministic build stamp.

### P1 — Beta launch readiness

3. **Prove the live API end-to-end.** The publish pipeline is wired
   (`.github/workflows/publish-cloudflare.yml`: KV pointer, R2 history,
   `smoke:live` against `metagraph.sh`). Confirm a green production publish and a
   passing `npm run smoke:live` (envelopes, CORS, ETags, R2 fallback, RPC-disabled
   contract).
4. **Ship a frontend integration handoff.** `generated/metagraphed-client.ts`,
   `generated/metagraphed-api.d.ts`, and `openapi.json` exist but are not packaged
   or documented for the UI team: envelope shape (`ok`/`schema_version`/`data`/
   `meta`/`error`), pagination/sort/filter semantics (already implemented in
   `workers/api.mjs`), cache profiles, error codes, `x-metagraph-*` headers, and
   stability guarantees.
5. **Two-Worker routing is a real config change.** `wrangler.jsonc` uses
   `custom_domain: true`, which binds the entire apex to one Worker (see
   architecture section).
6. **Versioning hygiene.** `package.json` is `0.0.0`; set `0.1.0-beta`. Keep the
   `CONTRACT_VERSION` date scheme and document the `/api/v1` stability contract.

### P1/P2 — RPC proxy (beta differentiator)

7. **Enable the read-only Subtensor RPC proxy.** The Worker logic already exists
   (`handleRpcProxyRequest` in `workers/api.mjs`: method allowlist, denied
   prefixes, body cap, SSRF guards, trusted upstream origins, pool selection).
   Prerequisites before flipping `METAGRAPH_ENABLE_RPC_PROXY=true`:
   - live probe-derived `/metagraph/rpc/pools.json` with `pool_eligible` endpoints
     in R2 (not currently generated/committed);
   - Cloudflare WAF + Rate Limiting rules;
   - an expanded `SAFE_RPC_METHODS` read set;
   - a live smoke pass.
     This is the one hosted-infra feature that separates Metagraphed from a
     pure-registry product.

### P2 — Performance and scale

8. **Monolithic artifacts are heavy for a browser.** `surfaces.json` (~1.1MB),
   `evidence-ledger.json` (~858KB), `search.json` (~659KB), and `profiles.json`
   (~605KB) are served whole. Rely on the Worker's existing pagination/filter
   layer for list routes, prefer per-subnet detail routes in the UI, confirm
   Cloudflare brotli/gzip plus the ETag and `stale-while-revalidate` already set,
   and consider a slimmer search-index payload.
9. **KV pointer / rollback discipline.** Confirm `metagraph:latest` is published
   each run so the Worker reads versioned R2 rather than only `latest/`; the
   pointer-first rollback is documented in `docs/operations.md`.

### P2/P3 — Coverage-completeness flywheel (the moat, made visible)

10. **First-class, documented completeness score.** Promote the existing scoring
    machinery (`public/metagraph/review/profile-completeness.json`, `gaps.json`)
    into a public, explained per-subnet 0–100 metric plus aggregate registry
    coverage — not just an internal queue.
11. **Public coverage leaderboard / "what's missing" view** driven by
    `public/metagraph/review/enrichment-queue.json` and `gap-priorities.json` — the
    hero artifact the UI renders.
12. **README health/coverage SVG badges** (`/metagraph/health/badges/{netuid}.json`
    is already in the contract) — badges in subnet READMEs create distribution,
    backlinks, and an adoption flywheel.
13. **Community completeness flywheel.** The one-file PR / issue intake already
    exists; surface "you can fill this gap" calls to action so coverage improves
    through contributions, not only maintainer effort.
14. **Adapter showcase.** Keep Gittensor (SN74) and Allways (SN7) adapters
    pristine and expand their public dimensions as the reference for "complete."

## Frontend Architecture: Two Separate Cloudflare Workers

Current state: the `metagraphed` Worker binds the whole apex via
`custom_domain: true` and serves the SPA/static itself through the `ASSETS`
binding (`run_worker_first` only for `/api/*`, `/rpc/*`, `/metagraph/*`). A custom
domain routes all hostname traffic to a single Worker, so a second Worker cannot
share the apex while `custom_domain` is set.

Recommended model — same apex, path-routed via zone routes (no CORS, matches the
README's `metagraph.sh/subnets/7` + `metagraph.sh/metagraph/subnets.json`
examples):

- **Backend Worker (`metagraphed`)** — switch from `custom_domain: true` to zone
  route patterns `metagraph.sh/api/*`, `metagraph.sh/metagraph/*`,
  `metagraph.sh/rpc/*`. Keep the `ASSETS` binding only for the compact
  `public/metagraph/*` artifacts. Drop SPA-serving responsibility.
- **Frontend Worker (`metagraphed-ui`)** — its own `wrangler` project, route
  `metagraph.sh/*` (catch-all, lowest precedence). Serves the SPA; its API base
  URL is same-origin `/api/v1`, so no CORS and no cross-origin cookies.
- Cloudflare matches more-specific routes first, so `/api/*` and friends hit the
  backend and everything else falls through to the UI.

Simpler fallback (subdomain split): backend on `api.metagraph.sh`
(`custom_domain`), UI on `metagraph.sh`, relying on the Worker's existing
permissive CORS. Offer only if zone-route management is undesirable.

Handoff kit for the UI team: a published, versioned `openapi.json`; the generated
`.d.ts` + client (optionally an npm package later); a one-page integration guide
(envelope, pagination, cache, error codes, `x-metagraph-*` headers, stability
guarantees); and a handful of copy-paste example queries against the live beta.

## Roadmap

### Phase 0 — Truth fixes (unblocks a credible beta)

- Fix `GITHUB_TOKEN` plumbing so published Gittensor/Allways adapters carry real
  repository metadata (Finding 1).
- Add a real `published_at` / `as_of` field distinct from the deterministic build
  stamp (Finding 2).
- Set `package.json` to `0.1.0-beta`; document the `/api/v1` stability contract
  (Finding 6).

### Phase 1 — Beta launch

- Confirm a green production publish and a passing `npm run smoke:live`
  (Finding 3).
- Restructure routing to two Workers via zone routes; coordinate the
  `metagraphed-ui` Worker project (architecture section).
- Ship the frontend handoff kit (Finding 4).
- Performance pass: confirm compression and lean the heavy list payloads for
  browser use (Finding 8).

### Phase 2 — RPC proxy differentiator (parallelizable)

- Generate and publish probe-derived `rpc/pools.json` with eligible endpoints;
  configure Cloudflare WAF + Rate Limiting; expand the safe read method set; flip
  `METAGRAPH_ENABLE_RPC_PROXY=true`; live smoke (Finding 7).

### Phase 3 — Coverage-completeness flywheel (post-launch, ongoing)

- Publish the completeness score + methodology (Finding 10).
- Build the coverage leaderboard / "what's missing" hero artifact (Finding 11).
- Add README badges (Finding 12), community gap-fill CTAs (Finding 13), and
  adapter expansion (Finding 14).

## Verification

- **Adapter fix:** re-run `npm run adapters:snapshot` with a valid token; assert
  `gittensor.json` has `captured_count > 0`, real `pushed_at`, and no
  `Bad credentials`.
- **Timestamps:** assert published artifacts carry a non-epoch `published_at`
  while the deterministic build stays reproducible across rebuilds.
- **Pipeline integrity:** `npm run check`, `npm test` (coverage gate), and
  `npm run pipeline:check` stay green.
- **Live beta:** `npm run smoke:live` covers envelopes, CORS, ETag/304,
  R2-fallback routes, invalid-query 400s, and the RPC contract.
- **Routing split:** both Workers resolve on `metagraph.sh` (UI at `/`, API at
  `/api/v1`, artifacts at `/metagraph/*`) with same-origin fetches and no CORS
  errors.
- **RPC proxy:** with the flag on, allowed read methods proxy through an eligible
  pool endpoint while denied/write methods return 403; with the flag off the proxy
  returns `rpc_proxy_disabled`.
- **Frontend handoff:** the UI team can generate a typed client from the published
  OpenAPI and render the coverage/leaderboard artifacts against the live beta.

## Open coordination items (not blockers)

- Confirm the `metagraphed-ui` deploy target (its own Worker project + route).
- Decide whether to publish generated types as an npm package now or hand off
  files for beta.
- Confirm the Cloudflare plan supports the WAF / Rate Limiting rules the RPC proxy
  needs.
