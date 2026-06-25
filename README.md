# African Bitcoin Payment Service Discovery Protocol

**An open protocol for discovering Bitcoin payment services across Africa.**

> Discovery finds. Attestation vouches. Settlement is yours.

## The problem

A Lightning wallet wants to send money to an M-Pesa account in Tanzania. Today, there is no way to automatically find a service that can do this. The wallet developer must already know a specific provider exists. Discovery is manual and relationship-bound. It does not scale.

## The solution

This protocol is a shared, decentralised directory for African Bitcoin payment services. Any provider can publish a listing. Any wallet can query it. Trust is established through attestations — providers vouching for each other.

Built on [Nostr](https://nostr.com/) — no single point of control, no registration required, no API keys.

## How it works

```
┌───────────────────────────────────────────────────────┐
│  Layer 1 — Providers                                  │
│  Provider A · Provider B · Provider C · Provider D    │
│  Each publishes a signed service listing              │
│  Providers are also consumers (cross-border)          │
└──────────┬────────────────────────────┬───────────────┘
           │ signed Nostr events        │ query for other providers
┌──────────▼────────────────────────────▼───────────────┐
│  Layer 2 — Discovery relay network                    │
│  Nostr relays. No single point of control.            │
└──────────────────────┬────────────────────────────────┘
                       │ query + filter
┌──────────────────────▼────────────────────────────────┐
│  Layer 3 — Attestation (web of trust)                 │
│  Providers vouch for each other                       │
│  More attestations = higher trust score               │
└──────────────────────┬────────────────────────────────┘
                       │ ranked results
┌──────────────────────▼────────────────────────────────┐
│  Layer 4 — Consumers                                  │
│  Wallet A · Wallet B · Wallet C · Wallet D            │
│  Provider A queries for Provider B (cross-border)     │
│  Any app, wallet, or provider can query               │
└───────────────────────────────────────────────────────┘
```

## Quick example

A wallet wants to find a Tanzania M-Pesa off-ramp:

```json
{
  "kinds": [38383],
  "#country": ["TZ"],
  "#direction": ["off-ramp"],
  "#rail_out": ["m-pesa"]
}
```

The relay returns matching providers. The wallet checks attestations, pings the health endpoint, and routes the transaction. The user just sees "Send to M-Pesa (Tanzania)" — discovery happens in under 2 seconds.

## Provider-to-provider routing

Providers are not just advertisers — they are also consumers. When Provider A in Tanzania receives a request to send money to Kenya, it queries the protocol, finds Provider B in Kenya, and routes the Kenyan leg automatically. The user sees one transaction. Two providers collaborated behind the scenes.

```
User in TZ ──► Provider A (TZ) ──► Discovery ──► Provider B (KE) ──► M-Pesa Kenya
```

No single provider needs to cover every country. The standard settlement API (v0.2) makes this seamless — every provider speaks the same `/quote` → `/execute` → `/status` language.

## Event kinds

| Kind | Purpose |
|------|---------|
| `38383` | Service listing (replaceable) |
| `38384` | Attestation (provider vouches for provider) |
| `38385` | Revocation (trust withdrawal) |

## Documentation

| Document | Description |
|----------|-------------|
| [Specification](spec/NIP-XXXXX.md) | Full NIP specification |
| [Data model](spec/data-model.md) | Service listing fields |
| [Attestation model](spec/attestation.md) | Web of trust |
| [Settlement API (v0.2)](spec/settlement-api.md) | Standard settlement flow (draft) |
| [Risks and mitigations](docs/risks-and-mitigations.md) | Known risks and proposed solutions |
| [Implementation roadmap](docs/implementation-roadmap.md) | Build plan |
| [Examples](examples/) | JSON examples of events, queries, and provider-to-provider flows |

## Who is this for?

**Providers** — African Bitcoin payment companies. Publish your service listing so wallets can find you automatically. Query the directory to find providers in other countries for cross-border routing.

**Wallets** — Lightning wallets, Bitcoin apps, remittance platforms. Integrate the querier and offer "Send to M-Pesa/MTN/Airtel" without individual provider integrations.

**The Alliance** — The Africa Bitcoin Payment Alliance coordinates development and operates reference relays.

## Principles

- **Open** — Anyone can publish. Anyone can query. No permission required.
- **Decentralised** — Nostr relays, no single point of control.
- **Trust without centralisation** — Attestations from peers, not a central authority.
- **Privacy-preserving** — Fee ranges not exact fees. Capability not capacity.
- **Settlement out of scope** — The protocol introduces parties. How value moves is between them.

## Status

🟡 **Draft** — Under active development by the Africa Bitcoin Payment Alliance. Feedback welcome.

## Origin

This protocol was proposed at the first Africa Bitcoin Payment Retreat in Naivasha, Kenya (June 13–15, 2026), supported by the Human Rights Foundation (HRF).

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

[MIT](LICENSE)
