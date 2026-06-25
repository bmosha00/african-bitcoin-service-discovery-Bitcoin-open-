# Data Model Reference

Complete reference for all tags used in the service discovery protocol.

## Service listing tags (kind 38383)

## Tag indexing (why some tags are single letters)

Nostr relays only index **single-letter** tags for server-side filtering. So the five fields a consumer filters on use single-letter tags; everything else uses readable multi-letter tags and is read from the event after it is fetched.

| Field | Tag | Filterable |
|-------|-----|-----------|
| country | `c` | yes (server-side) |
| direction | `o` | yes (server-side) |
| rail_in | `i` | yes (server-side) |
| rail_out | `m` | yes (server-side) |
| currency | `f` | yes (server-side) |

All other tags below are display/metadata and are not used in relay filters.

### Required tags

#### `d` — Service identifier
Unique identifier for this service listing. Format: `{provider}-{country}-{direction}`

#### `alt` — Human description (NIP-31)
Always `African Bitcoin payment service listing`. Lets generic Nostr clients render the event meaningfully.

#### `v` — Protocol version
Schema version, currently `0.2`. Clients may warn or reject on unknown versions.

#### `c` — Country code (filterable)
ISO 3166-1 alpha-2, uppercase. Common values: `TZ`, `KE`, `NG`, `GH`, `ZA`, `UG`, `ZM`, `RW`. A provider operating in multiple countries publishes separate listings per country.

#### `o` — Service direction (filterable)
`off-ramp` (Bitcoin → fiat), `on-ramp` (fiat → Bitcoin), `both`

#### `i` — Inbound payment rail (filterable)
`lightning`, `on-chain`, `ecash`, `lnurl`

#### `m` — Outbound payment rail (filterable)
`m-pesa`, `mtn-momo`, `airtel-money`, `orange-money`, `bank`, `cash`

#### `f` — Fiat currency (filterable)
ISO 4217, uppercase. Common values: `TZS`, `KES`, `NGN`, `GHS`, `ZAR`, `UGX`, `ZMW`, `RWF`

#### `name` — Provider name
Human-readable name of the provider.

#### `endpoint` — API base URL
HTTPS URL where the provider's API is reachable.

#### `health` — Health check URL
HTTPS URL that returns liveness information.

#### `status` — Current status
`active` (operational), `maintenance` (temporarily unavailable), `offline` (not operational)

### Optional tags

#### `network` — Mobile network operator
Examples: `vodacom-tz`, `safaricom-ke`, `mtn-ng`, `airtel-ug`

#### `min_amount` / `max_amount` — Transaction limits
In local currency (as strings).

#### `fee_range` — Fee percentage
Range to protect competitive information. Example: `1.5-2.2`

#### `speed` — Settlement speed
`seconds` (< 60s), `minutes` (1–30 min), `hours` (30 min to 24 hours)

#### `ttl` — Time to live
Default: `90000` (25 hours)

#### `protocols` — Lightning protocol support
Comma-separated: `bolt11`, `bolt12`, `nwc`, `lnurl`, `webln`, `keysend`

#### `kyc` — KYC requirements
`none`, `light` (phone number), `full` (government ID)

> **Liveness has no heartbeat tag.** Providers SHOULD republish only on change (fee, status, rail, endpoint). `ttl` bounds how long a listing is considered fresh; the `/health` endpoint is the real-time liveness signal. There is no fixed-interval heartbeat — it would waste relay bandwidth without improving liveness.

## Content field

`content` for kind 38383 is a JSON object of optional extended metadata. All keys are optional; unknown keys SHOULD be preserved by consumers but MAY be ignored. Use `{}` when there is nothing to add.

| Key | Type | Meaning |
|-----|------|---------|
| `description` | string | Human-readable service description |
| `website` | string | Provider homepage (https URL) |
| `support` | string | Support contact (email, https URL, or `nostr:` npub) |
| `logo` | string | Logo URL (https; square, ≤512px recommended) |

Kinds 38384 (attestation) and 38385 (revocation) use an empty `content` string `""`.

## Attestation tags (kind 38384)

Required: `d` (replaceable id), `alt` (`African Bitcoin provider attestation (vouch)`), `v` (`0.2`), `p` (target provider pubkey — **64-char hex, not npub**), `rating`.
Optional: `since`, `volume`, `note`.

## Revocation tags (kind 38385)

Required: `d`, `alt` (`African Bitcoin provider trust revocation`), `v` (`0.2`), `p` (target pubkey — **64-char hex**), `action` (`revoked`), `reason`.
Optional: `effective`.

> Pubkeys in `p` tags are always lowercase 64-char hex per NIP-01. `npub…` is a display encoding only and must never appear in a tag value.

## Tag vocabulary governance

New tag values can be proposed by any alliance member via GitHub issue. Discussion period: 7 days. If no objections, the value is added.
