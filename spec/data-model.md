# Data Model Reference

Complete reference for all tags used in the service discovery protocol.

## Service listing tags (kind 38383)

### Required tags

#### `d` — Service identifier
Unique identifier for this service listing. Format: `{provider}-{country}-{direction}`

#### `name` — Provider name
Human-readable name of the provider.

#### `country` — Country code
ISO 3166-1 alpha-2 country code. Common values: `TZ`, `KE`, `NG`, `GH`, `ZA`, `UG`, `ZM`, `RW`

A provider operating in multiple countries publishes separate listings per country.

#### `direction` — Service direction
`off-ramp` (Bitcoin → fiat), `on-ramp` (fiat → Bitcoin), `both`

#### `rail_in` — Inbound payment rail
`lightning`, `on-chain`, `ecash`, `lnurl`

#### `rail_out` — Outbound payment rail
`m-pesa`, `mtn-momo`, `airtel-money`, `orange-money`, `bank`, `cash`

#### `currency` — Fiat currency
ISO 4217 currency code. Common values: `TZS`, `KES`, `NGN`, `GHS`, `ZAR`, `UGX`, `ZMW`, `RWF`

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

#### `heartbeat` — Refresh strategy
`daily`, `hourly`, `on-change`

## Tag vocabulary governance

New tag values can be proposed by any alliance member via GitHub issue. Discussion period: 7 days. If no objections, the value is added.
