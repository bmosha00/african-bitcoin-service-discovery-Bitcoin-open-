# Standard Settlement API (v0.2 — Draft)

> **Status:** Future scope. Settlement is out of scope for v0.1. This draft is published early to gather feedback.

## Motivation

Once a wallet or provider discovers another provider via the protocol, it still needs to execute a transaction. Today every provider has a different API. A wallet must do a separate integration for each provider.

The standard settlement API defines a common flow so a wallet or provider integrates once and works with every other provider in the directory.

## The flow

Four endpoints. Same format for every provider.

```
Consumer (wallet or provider)       Provider
  │                                    │
  ├──── POST /v1/quote ──────────────►│  Request a quote
  │◄─── quote response ───────────────┤  Fee, rate, invoice
  │                                    │
  ├──── (pay Lightning invoice) ──────►│  Execute payment
  │                                    │
  ├──── GET /v1/status/:id ──────────►│  Check status
  │◄─── status response ──────────────┤  completed/pending/failed
  │                                    │
  ├──── GET /v1/providers ────────────►│  Provider info (optional)
  │◄─── provider metadata ────────────┤
```

## Status values

| Status | Meaning |
|--------|---------|
| `pending` | Quote created, awaiting Lightning payment |
| `processing` | Payment received, fiat disbursement in progress |
| `completed` | Fiat delivered successfully |
| `failed` | Delivery failed (see error field) |
| `expired` | Quote TTL elapsed without payment |
| `refunded` | Payment returned to sender |

## Standard error codes

| Code | Meaning | Retryable |
|------|---------|-----------|
| `RECIPIENT_UNREACHABLE` | Phone not registered | No |
| `AMOUNT_TOO_LOW` | Below minimum | No |
| `AMOUNT_TOO_HIGH` | Above maximum | No |
| `CAPACITY_EXCEEDED` | Provider at capacity | Yes |
| `NETWORK_ERROR` | Mobile money timeout | Yes |
| `RATE_EXPIRED` | Exchange rate changed | No (re-quote) |
| `PROVIDER_OFFLINE` | In maintenance | Yes |

## Open questions

1. Should the quote endpoint accept `amount_fiat` as an alternative to `amount_sats`?
2. Should there be a standard refund endpoint?
3. Rate limiting recommendations?

These questions are for alliance discussion before finalising v0.2.
