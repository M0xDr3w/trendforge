# TrendForge — Immediate Next Actions & Ideas

**Current (post 2026-07-05 review):** Strong prototype + real X + improved exports (MD thread + JSON sidecar for handoff). README top-tier. Keyword clustering is the current ceiling.

## Immediate (do these first)
- Test full flow: `npm run dev`, SYNC REAL (with token), select cluster, DOWNLOAD THREAD (MD+JSON). Verify files land and look postable.
- `X_BEARER_TOKEN=... npx vercel dev` for proxy path.
- Pair with ForgeRouter: run gateway, paste forged text as prompt for refinement.
- Commit the cleaned state.

## Short-term (1-2 weeks)
- Replace or augment `computeClusters` + `KEYWORD_BUCKETS` with lightweight semantic (browser embeddings via @xenova/transformers or simple tfidf + cosine if deps ok).
- Wire real LLM for `forgeContent` / angle gen: accept ForgeRouter URL or copy-to-Grok improved prompt. Add temperature / model choice in UI.
- Analytics sidebar: theme freq, sentiment histogram, top rising clusters.

## Medium
- Config file (queries, poll ms, buckets).
- Persistent "radars" (saved searches + signals).
- Full bundle export: timestamped dir with thread.md, meta.json, images/ (stub for multimodal).
- Velocity + better shift detection using `computeVelocity` from lib.

## Composability
- JSON sidecar is the contract: `{topic, volume, sentiment, forged, sparks, timestamp}`.
- Feed directly to MakerLog or future synthesis tools.

See MASTER_ROADMAP.md for priorities and diagrams.

Local-first always. Ship original angles.
