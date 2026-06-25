# NIP-XXXXX: African Bitcoin Payment Service Discovery

`draft` `optional`

## Abstract

This NIP defines three event kinds for discovering, attesting, and revoking trust in Bitcoin payment services across Africa. Providers publish signed service listings to Nostr relays. Consumers (wallets, apps) query relays to find providers matching their needs. Attestations from other providers establish a web of trust.

## Motivation

Cross-border Bitcoin payments in Africa require off-ramps and on-ramps that bridge Lightning/on-chain to local mobile money systems (M-Pesa, MTN MoMo, Airtel Money, etc). Today, discovering these services is manual and relationship-bound. This NIP creates a permissionless, decentralised directory.

## Event kinds

### Kind 38383: Service listing

A parameterized replaceable event (NIP-33) where a provider advertises its payment capabilities.

**Required tags:**

The five filterable fields use single-letter tags so relays index them for server-side filtering. The rest are display tags read from the fetched event.

| Tag | Description | Filterable | Example |
|-----|-------------|-----------|---------|
| `d` | Unique service identifier | — | `provider-a-tz-offramp` |
| `alt` | NIP-31 human description | — | `African Bitcoin payment service listing` |
| `v` | Protocol version | — | `0.2` |
| `c` | Country (ISO 3166-1 alpha-2) | yes | `TZ` |
| `o` | Service direction | yes | `off-ramp` / `on-ramp` / `both` |
| `i` | Inbound rail | yes | `lightning` / `on-chain` / `ecash` |
| `m` | Outbound rail | yes | `m-pesa` / `mtn-momo` / `airtel-money` / `bank` / `cash` |
| `f` | Fiat currency (ISO 4217) | yes | `TZS` |
| `name` | Human-readable provider name | — | `Provider A` |
| `endpoint` | API base URL | — | `https://api.example.com` |
| `health` | Liveness check URL | — | `https://api.example.com/health` |
| `status` | Current status | — | `active` / `maintenance` / `offline` |

**Optional tags:**

| Tag | Description | Example |
|-----|-------------|---------|
| `network` | Mobile network operator | `vodacom-tz` |
| `min_amount` | Minimum in local currency | `2500` |
| `max_amount` | Maximum in local currency | `1000000` |
| `fee_range` | Fee percentage range | `1.5-2.2` |
| `speed` | Settlement speed | `seconds` / `minutes` / `hours` |
| `ttl` | Seconds until stale | `90000` (25 hours) |
| `protocols` | Supported Lightning protocols | `bolt11,nwc,lnurl` |
| `kyc` | KYC requirement level | `none` / `light` / `full` |
| `heartbeat` | Refresh strategy | `daily` / `hourly` / `on-change` |

**Liveness:** Providers SHOULD re-publish at least once every 24 hours. Consumers SHOULD treat listings older than the TTL as stale.

### Kind 38384: Attestation

A parameterized replaceable event where one provider vouches for another.

| Tag | Description | Example |
|-----|-------------|---------|
| `d` | Unique attestation ID | `vouch-3bf0c63fcb934634` |
| `alt` | NIP-31 human description | `African Bitcoin provider attestation (vouch)` |
| `v` | Protocol version | `0.2` |
| `p` | Hex pubkey of provider being vouched for | `3bf0c63f…459d` (64-char hex) |
| `rating` | Trust level | `reliable` / `verified` / `trusted` |
| `since` | Relationship start | `2026-01` |
| `volume` | Transaction volume (general) | `low` / `medium` / `high` |
| `note` | Human-readable context | `Processed cross-border flows reliably` |

### Kind 38385: Revocation

An event that withdraws trust from a provider.

| Tag | Description | Example |
|-----|-------------|---------|
| `d` | Unique revocation ID | `revoke-deadbeefdeadbeef` |
| `alt` | NIP-31 human description | `African Bitcoin provider trust revocation` |
| `v` | Protocol version | `0.2` |
| `p` | Hex pubkey of provider being revoked | `deadbeef…beef` (64-char hex) |
| `action` | Action taken | `revoked` / `suspended` |
| `reason` | Human-readable reason | `Non-delivery of mobile money payouts` |
| `effective` | Effective date | `2026-09-15` |

> All `p` tag values are lowercase 64-char hex per NIP-01. `npub…` is a display encoding only and never appears in tags.

## Query flow

1. Consumer sends a REQ filter to relays using single-letter tags for server-side matching:

```json
{ "kinds": [38383], "#c": ["TZ"], "#o": ["off-ramp"], "#m": ["m-pesa"], "limit": 500 }
```

The relay performs the AND match server-side, so the consumer does not download the entire kind-38383 population. This also excludes other protocols sharing kind 38383 (e.g. Mostro), since their events lack a `c` tag.

2. Relay returns matching service listings
3. Consumer fetches attestations for each result (`{ "kinds": [38384], "#p": ["<hex-pubkey>"] }`)
4. Consumer checks for revocations (`{ "kinds": [38385], "#p": ["<hex-pubkey>"] }`)
5. Consumer ranks results by trust score, speed, and fee range
6. Consumer pings top-ranked provider's `/health` endpoint
7. If healthy, consumer connects to the provider's API for settlement

## Content field

Kind 38383 carries optional extended metadata as a JSON object in `content` (e.g. `description`, `website`, `support`), or `{}` if none. Kinds 38384 and 38385 use an empty `content` string.

## Provider-to-provider routing

Providers are also consumers. Provider A (Tanzania) can query the directory to find Provider B (Kenya) and route cross-border payments. The query flow is identical. The standard settlement API (future NIP) enables providers to interoperate without custom integrations.

## Health endpoint

Every provider SHOULD expose a health endpoint returning: status, uptime, average speed, capacity (available/limited/full), and protocol version.

## Trust scoring

| Source | Weight |
|--------|--------|
| Alliance attestation | +3 (bootstrap, reduces to +1 at maturity) |
| Individual provider attestation | +1 |
| Unrecognised key attestation | 0 |
| Active revocation | -10 |

### Algorithm (deterministic)

So that every client computes the same score, the algorithm is fully specified:

1. Fetch all kind-38384 attestations and kind-38385 revocations whose `p` tag is the target pubkey.
2. **Verify each event's signature.** Discard any that fail.
3. Keep only events where the `p` tag equals the target. For attestations, discard self-vouches (attester == target).
4. **Deduplicate by author**, keeping each author's most recent event (by `created_at`). One key counts at most once.
5. Classify each remaining author into a tier: `ALLIANCE` if it is the alliance pubkey, else `PROVIDER` if it is a recognised provider, else `UNKNOWN`.
6. Score = Σ attestation weights (ALLIANCE +3, PROVIDER +1, UNKNOWN 0) + Σ revocation penalties. **Revocations count only from recognised keys** (ALLIANCE or PROVIDER) at −10 each; revocations from unknown keys are ignored entirely.

```
score = (alliance_attestations × 3) + (provider_attestations × 1)
        − (recognised_revocations × 10)
```

Suggested display class: `score ≥ 5` → trusted, `score ≥ 1` → reliable, `score ≤ 0` → risky.

Only recognised keys move the score in either direction; unknown keys carry no weight, which provides Sybil resistance.

## Privacy considerations

Fee ranges not exact fees. Amount ranges not real-time liquidity. No transaction volume in listings. Health endpoint returns capacity levels not dollar amounts.

## Security considerations

All listing, attestation, and revocation events come from untrusted publishers. Consumers MUST:

- **Verify every event signature** before trusting `pubkey` as an identity. The trust score depends on it.
- **Treat all free-text fields as untrusted** — `name`, `note`, `reason`, and any `content` metadata. Escape them before rendering in a UI to avoid injection (e.g. stored XSS in a web client).
- **Validate `health`/`endpoint` URLs before fetching.** They are attacker-controlled; a naive fetch enables SSRF. Require https and reject private/reserved addresses (loopback, RFC 1918, link-local/metadata `169.254.0.0/16`, and the IPv6 equivalents including IPv4-mapped/NAT64/6to4 forms). Cap response size and bound concurrency.

The reference library (`lib/`) implements all three.

## Settlement

Settlement is explicitly out of scope. A standard settlement API is planned for a future NIP.
