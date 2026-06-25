# Known Risks and Mitigations

Five architectural risks identified during the design of the protocol, with proposed mitigations.

## Risk 1: Cold start problem (HIGH)

**Problem:** The protocol needs both providers AND wallets to adopt. If no wallet queries, providers won't publish. If no providers publish, wallets won't integrate.

**Mitigation:** Launch with a single corridor between two countries and a single wallet partner. One corridor, one demo, then expand.

**Decision needed:** Does the alliance agree on the first corridor? Who commits as the first wallet partner?

## Risk 2: Settlement is out of scope (MEDIUM)

**Problem:** Discovery introduces parties, but every provider has a different API. A wallet must do separate integrations for each provider. This doesn't scale.

**Mitigation:** Define a standard settlement API (v0.2) with four endpoints: `/v1/quote`, `/v1/execute` (via Lightning invoice), `/v1/status`, `/v1/providers`. See [settlement-api.md](../spec/settlement-api.md) for the draft.

**Decision needed:** Should the settlement API be drafted in parallel with v0.1 discovery implementation?

## Risk 3: Heartbeat bandwidth at scale (LOW)

**Problem:** 30-minute heartbeats from 200+ providers = 9,600+ events per day per relay. Mostly identical data.

**Mitigation:** Change to daily keepalive + publish-on-change. TTL extends to 25 hours. Health endpoint handles real-time liveness. Cuts traffic by ~95%.

**Decision needed:** 30-minute heartbeat (simpler) or daily keepalive (efficient)?

## Risk 4: Trust centralisation (MEDIUM)

**Problem:** The Alliance's attestation is worth +3 points vs +1 for individual providers. Early on, the Alliance dominates trust scores.

**Mitigation:** Accepted as a bootstrap mechanism. Planned reduction: Alliance weight drops to +1 at 12 months as organic cross-attestations grow.

**Decision needed:** Does the alliance agree to the +3 bootstrap weight with planned reduction?

## Risk 5: Dispute resolution (HIGH)

**Problem:** A provider takes Lightning payment but doesn't deliver mobile money. No mechanism to flag bad actors.

**Mitigation:** Three-layer approach:
1. **Wallet-side tracking** — wallets track success rates locally, deprioritise unreliable providers
2. **Alliance complaint process** — evidence-based, 72-hour response window, graduated penalties
3. **Revocation event (kind 38385)** — formal trust withdrawal published on-protocol

No anonymous negative attestations — too easy for competitors to abuse.

**Decision needed:** Does the alliance agree to the off-protocol complaint mechanism? Who handles disputes?
