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

| Tag | Description | Example |
|-----|-------------|---------|
| `d` | Unique service identifier | `provider-a-tz-offramp` |
| `name` | Human-readable provider name | `Provider A` |
| `country` | ISO 3166-1 alpha-2 | `TZ` |
| `direction` | Service direction | `off-ramp` / `on-ramp` / `both` |
| `rail_in` | Inbound rail | `lightning` / `on-chain` / `ecash` |
| `rail_out` | Outbound rail | `m-pesa` / `mtn-momo` / `airtel-money` / `bank` / `cash` |
| `currency` | ISO 4217 fiat currency | `TZS` |
| `endpoint` | API base URL | `https://api.example.com` |
| `health` | Liveness check URL | `https://api.example.com/health` |
| `status` | Current status | `active` / `maintenance` / `offline` |

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
| `d` | Unique attestation ID | `provider-b-vouches-provider-a` |
| `p` | Pubkey of provider being vouched for | `npub1...` |
| `rating` | Trust level | `reliable` / `verified` / `trusted` |
| `since` | Relationship start | `2026-01` |
| `volume` | Transaction volume (general) | `low` / `medium` / `high` |
| `note` | Human-readable context | `Processed cross-border flows reliably` |

### Kind 38385: Revocation

An event that withdraws trust from a provider.

| Tag | Description | Example |
|-----|-------------|---------|
| `d` | Unique revocation ID | `revoke-provider-x` |
| `p` | Pubkey of provider being revoked | `npub1...` |
| `action` | Action taken | `revoked` / `suspended` |
| `reason` | Human-readable reason | `Non-delivery of mobile money payouts` |
| `effective` | Effective date | `2026-09-15` |

## Query flow

1. Consumer sends a REQ filter to relays
2. Relay returns matching service listings
3. Consumer fetches attestations for each result
4. Consumer checks for revocations
5. Consumer ranks results by trust score, speed, and fee range
6. Consumer pings top-ranked provider's `/health` endpoint
7. If healthy, consumer connects to the provider's API for settlement

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

## Privacy considerations

Fee ranges not exact fees. Amount ranges not real-time liquidity. No transaction volume in listings. Health endpoint returns capacity levels not dollar amounts.

## Settlement

Settlement is explicitly out of scope. A standard settlement API is planned for a future NIP.
