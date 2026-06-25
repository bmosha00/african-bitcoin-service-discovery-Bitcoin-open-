# Attestation Model

How trust works in the service discovery protocol.

## Overview

Discovery surfaces candidates. Attestation ranks and filters them. The two are inseparable: discovery without trust is a spam list, trust without discovery is just your phone contacts.

## How attestations work

An attestation is a signed Nostr event (kind 38384) where one provider vouches for another. Attestations are one-directional, public, signed, and replaceable.

## Trust scoring

| Source | Weight | Rationale |
|--------|--------|-----------|
| Alliance attestation | +3 | Bootstrap trust anchor (reduces to +1 at maturity) |
| Provider attestation (recognised key) | +1 | Peer trust |
| Provider attestation (unrecognised key) | 0 | Sybil resistance |
| Active revocation (kind 38385) | -10 | Effectively removes from results |

## Sybil resistance

Only attestations from recognised keys carry weight. A key is "recognised" if it belongs to a known alliance member or a provider that itself has attestations from recognised keys. This creates a chain of trust rooted in known entities.

## Trust bootstrap and decentralisation

### Phase 1: Alliance-dominated (launch)
Alliance attestation dominates (~60% of trust score).

### Phase 2: Mixed trust (6–12 months)
Providers accumulate cross-attestations. Alliance share drops to ~30%.

### Phase 3: Organic trust (12+ months)
Alliance weight reduces from +3 to +1. Trust primarily driven by peer attestations.

## Revocations (kind 38385)

### Who can revoke
The Alliance (via secretariat) or any individual provider (revoking their own attestation).

### No anonymous negative attestations
On-protocol negative attestations are not supported — too easy to abuse. Complaints go through the Alliance's off-protocol process.

## Dispute resolution

### Layer 1: Wallet-side tracking
Wallets track success/failure rates per provider locally. Private and ungameable.

### Layer 2: Alliance complaint
Users or wallets submit complaints to the secretariat with evidence.

### Layer 3: Alliance action
Investigation → warning → downgrade → revocation. Providers can appeal.
