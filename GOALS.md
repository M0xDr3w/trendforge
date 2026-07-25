# TrendForge / SpaceXAI — Goals & Loops

**Owner:** DrewMAX · **Status:** shipping v0.1  
**Product:** TrendForge (public signal surface)  
**Intelligence:** Grok-first · SpaceXAI Gateway (next) · ForgeRouter (optional local)

## North star

A human sets a goal; Grok proposes a plan and loop; tools gather X signal; asserts enforce safety; the human gates the ship; outcomes train the next prompt/recipe cycle.

## Goals

| ID | Goal | Status |
|----|------|--------|
| G0 | Onboard us — shared model, ship bar, secrets | active |
| G1 | Shippable TrendForge v0.1 | in progress |
| G2 | SpaceXAI Gateway v0 | planned |
| G3 | Learn loop (preferences → recipes) | scaffolded |
| G4 | Build-in-public loop | ongoing |

## Ship bar (G1)

1. Mock path: useful forge in &lt; 3 min, zero keys  
2. Real X: bearer → cluster → forge → export  
3. **Last forge durable in UI + export**  
4. **Grok preset** via `/api/forge-chat` + `XAI_API_KEY`  
5. Version ≥ 0.1.0, CI green  
6. Honest docs: what works / human-gated  

## Loops

```text
Loop S — SHIP:    ci → build → dogfood → deploy → public note
Loop R — RADAR:   ingest → cluster → forge → human ship content
Loop A — AGENT:   goal → plan → tools → draft → human gate  (gateway)
Loop L — LEARN:   accept/edit/reject → local preferences
Loop P — PUBLIC:  ship note → X → feedback → issues
```

## Asserts (non-negotiable)

- No secrets in client/git  
- No auto-post to X  
- Export uses last forge when present  
- LLM failure falls back to templates  

See `AGENTS.md` for Grok operator rules.
