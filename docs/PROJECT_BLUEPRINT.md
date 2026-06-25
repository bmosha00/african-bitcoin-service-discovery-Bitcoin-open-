# African Bitcoin Payment Service Discovery Protocol
## Project Blueprint — What We're Building, Why, and How

---

## The Problem We're Solving

Today, moving Bitcoin across African borders requires knowing someone who knows someone. A Lightning wallet that wants to send money to an M-Pesa account in Tanzania has no way to automatically find a service that can do this. The wallet developer must already know that a specific company exists, what it supports, and how to reach it.

This is the bottleneck for cross-border Bitcoin payments in Africa.

There are companies across the continent that can handle these payments — off-ramp providers in Tanzania, Kenya, South Africa, Nigeria, Ghana, and more. But there is no shared directory. No way for a wallet to ask "who handles M-Pesa in Tanzania?" and get an answer.

We are building that directory.

---

## What We're Building

An open, decentralised protocol that lets any Bitcoin payment company in Africa advertise its services, and any wallet, app, or other provider discover them automatically.

Think of it like DNS for payments. DNS turns "google.com" into an IP address. Our protocol turns "off-ramp, Tanzania, M-Pesa" into a list of providers that can handle it — ranked by trust, checked for liveness, ready to transact.

### Key Properties

- **Open** — Any company can publish a listing. Any wallet can query. No permission, no API keys, no registration.
- **Decentralised** — Built on Nostr relays. No single server controls the directory. If one relay goes down, others still serve the data.
- **Trust without centralisation** — Providers vouch for each other through signed attestation events. Trust grows organically through working relationships, not through a central authority.
- **Privacy-preserving** — Fee ranges not exact fees. Capability not capacity. Enough to be found, not enough to leak competitive intelligence.
- **Settlement out of scope** — The protocol introduces parties. How value actually moves is negotiated directly between them.

### The Critical Insight: Providers Are Also Consumers

A wallet discovering a provider is the obvious use case. But the real power is provider-to-provider routing. When Provider A in Tanzania receives a request to send money to Kenya, it queries the directory, finds Provider B in Kenya, and routes the Kenyan leg through Provider B's API. The user sees one transaction. Two providers collaborated behind the scenes.

No single provider needs to cover every country. The directory is the glue — providers discover each other automatically and chain together to serve corridors neither could handle alone.

---

## How It Works — Four Layers

```
┌─────────────────────────────────────────────────────────┐
│  Layer 1 — Providers                                    │
│  Provider A · Provider B · Provider C · Provider D · ...│
│  Each publishes a signed service listing                │
│  Providers are also consumers (cross-border)            │
└──────────┬──────────────────────────────┬───────────────┘
           │ signed Nostr events          │ query for other providers
┌──────────▼──────────────────────────────▼───────────────┐
│  Layer 2 — Discovery Relay Network                      │
│  Nostr relays (relay.damus.io, relay.nostr.band,        │
│  nos.lol). No single point of control.                  │
└──────────────────────┬──────────────────────────────────┘
                       │ query + filter
┌──────────────────────▼──────────────────────────────────┐
│  Layer 3 — Attestation (Web of Trust)                   │
│  Providers vouch for each other via signed events.      │
│  More attestations = higher trust score.                │
└──────────────────────┬──────────────────────────────────┘
                       │ ranked results
┌──────────────────────▼──────────────────────────────────┐
│  Layer 4 — Consumers                                    │
│  Wallet A · Wallet B · Wallet C · Wallet D · ...        │
│  Provider A queries for Provider B (cross-border)       │
│  Any app, wallet, or provider can query.                │
└─────────────────────────────────────────────────────────┘
```

### Layer 1: Providers

Any African Bitcoin payment company publishes a signed Nostr event (kind 38383) describing what it can do — country, direction (on-ramp/off-ramp), payment rails (Lightning, M-Pesa, MTN MoMo), limits, fees, speed, and an API endpoint.

The listing is signed with the provider's Nostr private key, so nobody can fake it.

### Layer 2: Discovery Relay Network

Listings are published to Nostr relays — servers that store and serve Nostr events. We use three public relays for redundancy: relay.damus.io, relay.nostr.band, nos.lol. If one goes down, the other two still serve the data.

No single entity controls these relays. No registration required. No API keys.

Later, the alliance may operate dedicated African relays (Nairobi, Lagos, Johannesburg) for better performance, but public relays work today at zero cost.

### Layer 3: Attestation (Web of Trust)

Discovery without trust is a spam list. Anyone can publish a listing claiming to handle M-Pesa in Tanzania. Attestations solve this.

An attestation is a signed Nostr event (kind 38384) where one provider vouches for another: "We have worked with this provider and they are reliable." When a wallet queries for providers, it also fetches attestations. More attestations from known providers = higher trust ranking.

Revocations (kind 38385) handle the opposite case — withdrawing trust from a provider found to be unreliable.

### Layer 4: Consumers

Any wallet, app, or provider can query the directory. Send a Nostr filter to any relay, get back matching providers, check attestations, ping the health endpoint, and route the transaction. The entire discovery process takes less than 2 seconds. The user never sees it.

---

## The Three Nostr Event Kinds

| Kind | Name | Purpose |
|------|------|---------|
| 38383 | Service Listing | "Here's what I can do" — a provider's advertisement |
| 38384 | Attestation | "I vouch for this provider" — trust signal from one provider to another |
| 38385 | Revocation | "I no longer trust this provider" — trust withdrawal |

All three are parameterized replaceable events (NIP-33), meaning new versions replace old ones automatically. A provider's listing is always current.

---

## Service Listing Data Model (Kind 38383)

Every provider publishes an event with these tags:

### Required Tags

| Tag | Example | Purpose |
|-----|---------|---------|
| d | provider-a-tz-offramp | Unique service ID (replaceable key) |
| name | Provider A | Human-readable provider name |
| country | TZ | ISO 3166-1 alpha-2 country code |
| direction | off-ramp | off-ramp, on-ramp, or both |
| rail_in | lightning | What comes in (lightning, on-chain, ecash) |
| rail_out | m-pesa | What goes out (m-pesa, mtn-momo, airtel-money, bank, cash) |
| currency | TZS | ISO 4217 fiat currency |
| endpoint | https://api.example.com | API base URL |
| health | https://api.example.com/health | Liveness check URL |
| status | active | active, maintenance, or offline |

### Optional Tags

| Tag | Example | Purpose |
|-----|---------|---------|
| network | vodacom-tz | Specific mobile network operator |
| min_amount | 2500 | Minimum transaction in local currency |
| max_amount | 1000000 | Maximum transaction in local currency |
| fee_range | 1.5-2.2 | Fee percentage range (not exact — protects competitive info) |
| speed | seconds | seconds, minutes, or hours |
| ttl | 90000 | Seconds until listing is stale (default: 25 hours) |
| protocols | bolt11,nwc,lnurl | Supported Lightning protocols |
| kyc | none | none, light, or full |
| heartbeat | daily | daily, hourly, or on-change |

---

## Trust Scoring

| Source | Weight | Rationale |
|--------|--------|-----------|
| Alliance attestation | +3 | Bootstrap trust anchor (reduces to +1 at 12 months) |
| Provider attestation (recognised key) | +1 | Peer trust from working relationship |
| Unknown key attestation | 0 | Sybil resistance — unknown keys carry no weight |
| Active revocation | -10 | Effectively removes from results |

Results ranked by: trust score → speed → fee range (lowest).

---

## Health Endpoint

Every provider exposes a simple GET endpoint:

```
GET /health

{
  "status": "active",
  "uptime_24h": "99.2%",
  "avg_speed_seconds": 12,
  "capacity": "available",
  "last_transaction": "2m ago",
  "version": "1.0.0"
}
```

Wallets and other providers ping this before routing a transaction. If it doesn't respond or returns "offline", they skip to the next provider. This is the real-time liveness signal.

---

## The Query Flow

Step by step, what happens when a wallet (or provider) needs to find a service:

1. Wallet A sends a Nostr filter to relays: `{ kinds: [38383], #country: ["TZ"], #direction: ["off-ramp"], #rail_out: ["m-pesa"] }`
2. Relay returns matching service listings
3. Wallet A fetches attestations for each result: `{ kinds: [38384], #p: ["provider_pubkey"] }`
4. Wallet A checks for revocations: `{ kinds: [38385], #p: ["provider_pubkey"] }`
5. Wallet A calculates trust score for each provider
6. Wallet A ranks results by trust → speed → fees
7. Wallet A pings top-ranked provider's /health endpoint
8. If healthy, Wallet A connects to provider's API to execute the transaction
9. If unhealthy, Wallet A tries the next provider

The user sees none of this. They just see "Send to M-Pesa (Tanzania)" as an option.

### Provider-to-Provider Flow

The same query works for cross-border routing between providers:

```
User in Country X ──► Provider A (Country X) ──► Discovery ──► Provider B (Country Y) ──► Recipient
                       handles origin side        finds dest    handles destination side
```

Provider A receives a request it can't fulfil locally. It queries the directory for a provider in the destination country, checks attestations, pings health, and routes the foreign leg. The user sees one seamless transaction.

---

## What We're Building — The npm Package

The protocol spec describes the rules. The npm package (`afri-bitcoin-discovery`) is the tool that any provider uses to participate. It has three modules:

### Publisher
Any provider imports it, configures their service details, and publishes to all three relays.

```javascript
const { Publisher } = require('afri-bitcoin-discovery');
const publisher = new Publisher({ privateKey, relays });
await publisher.publish(myServiceListing);
```

### Querier
Any wallet or provider imports it to find services across Africa.

```javascript
const { Querier } = require('afri-bitcoin-discovery');
const querier = new Querier({ relays });
const providers = await querier.find({ country: 'TZ', direction: 'off-ramp' });
```

### Attestation
Any provider imports it to vouch for partners or check trust scores.

```javascript
const { Attestation } = require('afri-bitcoin-discovery');
const attestation = new Attestation({ privateKey, relays });
await attestation.vouch(partnerPubkey, { rating: 'reliable' });
const score = await attestation.score(providerPubkey);
```

---

## Build Plan — 5 Steps

### Step 1: Setup & Keys ✅ DONE

What was built:
- `lib/src/config.js` — Event kinds (38383, 38384, 38385), three public relays (relay.damus.io, relay.nostr.band, nos.lol), trust weights, WebSocket polyfill for Node.js
- `lib/src/keys.js` — `generateKeys()` creates a new Nostr keypair, `loadKeys(hex)` loads from hex string, `loadKeysFromEnv()` loads from environment variable
- `lib/examples/generate-keys.js` — CLI tool to generate a provider identity
- `lib/package.json` — npm package configuration with dependencies (nostr-tools, ws)

Status: Tested and working. Ready to push to GitHub.

### Step 2: Publisher

What will be built:
- `lib/src/publisher.js` — The Publisher class
- Builds service listing events (kind 38383) from a simple config object
- Signs events with the provider's Nostr private key
- Publishes to all three public relays via nostr-tools SimplePool
- Supports two modes: daily keepalive (cron) and on-change (call when config changes)
- `lib/examples/publish-listing.js` — Working example that publishes a test listing

After this step: Any provider can publish their service to the discovery network with ~10 lines of code.

### Step 3: Querier

What will be built:
- `lib/src/querier.js` — The Querier class
- Queries relays with filters (country, direction, rail_out, currency)
- Parses raw Nostr events into clean, usable objects
- Includes `checkHealth(url)` function that pings a provider's /health endpoint
- Returns results sorted by freshness
- `lib/examples/query-providers.js` — Working example that searches for providers

After this step: Any wallet or provider can discover services across Africa.

### Step 4: Attestation

What will be built:
- `lib/src/attestation.js` — The Attestation class
- `vouch(pubkey, options)` — Publish an attestation (kind 38384) for a partner
- `revoke(pubkey, reason)` — Publish a revocation (kind 38385)
- `getAttestations(pubkey)` — Fetch all attestations for a provider
- `score(pubkey, knownProviders, alliancePubkey)` — Calculate trust score
- `lib/examples/publish-attestation.js` — Working example

After this step: The trust layer is functional. Providers can vouch for each other.

### Step 5: Index, Testing & Examples

What will be built:
- `lib/src/index.js` — Clean exports: `{ Publisher, Querier, Attestation, generateKeys, loadKeys, KINDS, DEFAULT_RELAYS }`
- End-to-end test: generate keys → publish listing → query → find listing → attest → check score
- All examples tested against live public relays
- README for the lib/ directory with quick start guide

After this step: The package is ready for any provider to npm install and use.

---

## GitHub Repository

**URL:** https://github.com/bmosha00/african-bitcoin-service-discovery-Bitcoin-open-

### Repository Structure

```
african-bitcoin-service-discovery-Bitcoin-open-/
├── README.md                         # Project overview, architecture diagram, quick example
├── CONTRIBUTING.md                   # How to contribute
├── LICENSE                           # MIT
│
├── spec/                             # Protocol specification
│   ├── NIP-XXXXX.md                  # Formal Nostr NIP (event kinds, tags, query flow)
│   ├── data-model.md                 # Complete tag reference with all values
│   ├── attestation.md                # Web of trust, scoring, dispute resolution
│   └── settlement-api.md            # v0.2 draft — standard /quote /execute /status API
│
├── docs/                             # Supporting documents
│   ├── developer-guide.md            # Step-by-step implementation guide for backend devs
│   ├── risks-and-mitigations.md      # 5 known risks with proposed solutions
│   ├── implementation-roadmap.md     # 4-phase build plan for the alliance
│   ├── Service_Discovery_Protocol.docx    # Full architecture specification
│   └── Service_Discovery_Addendum.docx    # Addendum addressing 5 architectural risks
│
├── examples/                         # JSON examples
│   ├── service-listing.json          # Example kind 38383 event
│   ├── attestation.json              # Example kind 38384 event
│   ├── revocation.json               # Example kind 38385 event
│   ├── wallet-query-flow.json        # Complete query sequence
│   └── provider-to-provider-flow.json # Cross-border routing example
│
└── lib/                              # npm package (afri-bitcoin-discovery)
    ├── package.json                  # Package config and dependencies
    ├── .gitignore                    # node_modules, .env
    ├── src/
    │   ├── index.js                  # Main exports (Step 5)
    │   ├── config.js                 # Event kinds, relays, trust weights (Step 1) ✅
    │   ├── keys.js                   # Key generation and loading (Step 1) ✅
    │   ├── publisher.js              # Publish service listings (Step 2)
    │   ├── querier.js                # Discover providers (Step 3)
    │   └── attestation.js            # Trust layer (Step 4)
    └── examples/
        ├── generate-keys.js          # Create a provider identity (Step 1) ✅
        ├── publish-listing.js        # Publish a test listing (Step 2)
        ├── query-providers.js        # Search for providers (Step 3)
        └── publish-attestation.js    # Vouch for a partner (Step 4)
```

---

## Known Risks and Mitigations

### Risk 1: Cold Start (HIGH)
The protocol needs both providers and wallets. Neither will adopt without the other.
**Mitigation:** Launch with one corridor between two countries, one wallet partner. One demo, then expand.

### Risk 2: Settlement Not Standardised (MEDIUM)
Discovery finds providers, but each has a different API. Wallets must integrate each one separately.
**Mitigation:** v0.2 defines a standard settlement API (/quote, /execute, /status). Build in parallel, ship after discovery proves itself.

### Risk 3: Heartbeat Bandwidth (LOW)
Fixed heartbeats from 200+ providers waste relay bandwidth.
**Mitigation:** Daily keepalive + publish-on-change. Health endpoint handles real-time liveness.

### Risk 4: Trust Centralisation (MEDIUM)
Alliance attestation dominates early trust scores.
**Mitigation:** Accepted as bootstrap mechanism. Alliance weight drops from +3 to +1 at 12 months.

### Risk 5: Dispute Resolution (HIGH)
No mechanism to flag bad providers who take payment but don't deliver.
**Mitigation:** Three layers — wallet-side tracking (private), alliance complaint process (72hr investigation), revocation events (kind 38385). No anonymous negative attestations.

---

## Origin

This protocol was proposed at the first Africa Bitcoin Payment Retreat in Naivasha, Kenya (June 13–15, 2026), supported by the Human Rights Foundation (HRF).

The retreat brought together builders from across the continent to address shared challenges in scaling Bitcoin payments in Africa. Service discovery and interoperability emerged from Block 3 (Open Rails & Interoperability) as a concrete initiative the alliance committed to building.

The protocol is open infrastructure. It belongs to no single company. It is designed to survive even if the alliance dissolves. Any provider can participate. Any wallet can query. The code is MIT licensed.

---

## Who This Is For

**African Bitcoin payment companies** — Publish your service listing so wallets find you automatically. Query the directory to find providers in other countries for cross-border routing. Vouch for partners you trust.

**Wallet developers** — Integrate the querier and offer "Send to M-Pesa/MTN/Airtel" to your users without individual provider integrations. One integration, every provider.

**The Africa Bitcoin Payment Alliance** — Coordinates development, operates reference infrastructure, provides the bootstrap trust anchor, handles dispute resolution.

**Anyone building on Bitcoin in Africa** — The protocol is permissionless. If you can publish a Nostr event, you can participate.

---

> Discovery finds. Attestation vouches. Settlement is yours.
>
> Open protocol. No single point of control. Built for Africa.
