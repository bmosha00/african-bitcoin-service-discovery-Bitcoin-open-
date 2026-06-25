# afri-bitcoin-discovery

Open protocol for discovering Bitcoin payment services across Africa. Publish a service listing, discover providers, and attest trust — all on [Nostr](https://nostr.com), no servers of your own, no API keys, no registration.

Think of it as DNS for payments: it turns `off-ramp, Tanzania, M-Pesa` into a ranked list of providers that can handle it.

- **Publish** — advertise what your service can do (kind `38383`)
- **Discover** — find providers by country, direction, and rail (client-side filtered)
- **Attest** — vouch for partners and compute trust scores (kinds `38384` / `38385`)

Full protocol details: [`../spec/`](../spec). Architecture and rationale: [`../docs/PROJECT_BLUEPRINT.md`](../docs/PROJECT_BLUEPRINT.md).

---

## 1. Install

```bash
# Inside this repo:
cd lib
npm install
```

> Once the package is published to npm, this becomes `npm install afri-bitcoin-discovery`.
> The examples below import `afri-bitcoin-discovery` (the published name). Until it's on npm,
> if you're running code from inside this repo, swap that for `require('./src')`.

Requires Node.js 18 or newer.

---

## 2. Generate your provider identity

Your identity on the network is a Nostr keypair. Generate it once and guard the private key — losing it means losing control of your listing.

```bash
node examples/generate-keys.js
```

Output:

```
Public key (share freely):
  3bf0c63f...          ← this is your permanent provider ID

Private key (KEEP SECRET — store in .env):
  a1b2c3d4...

Add to your .env file:
  NOSTR_PRIVATE_KEY=a1b2c3d4...
```

Put the private key in an environment variable, never in code:

```bash
echo "NOSTR_PRIVATE_KEY=a1b2c3d4..." >> .env
```

---

## 3. Publish a service listing

Advertise your service so any wallet or provider can find you. Only the required fields are mandatory; the rest sharpen ranking and matching.

```js
const { Publisher } = require('afri-bitcoin-discovery');

const publisher = new Publisher({ privateKey: process.env.NOSTR_PRIVATE_KEY });

await publisher.publish({
  // Required
  id:        'provider-a-tz-offramp',         // unique, stable service ID
  name:      'Provider A',
  country:   'TZ',                            // ISO 3166-1 alpha-2
  direction: 'off-ramp',                      // off-ramp | on-ramp | both
  rail_in:   'lightning',                     // lightning | on-chain | ecash
  rail_out:  'm-pesa',                        // m-pesa | mtn-momo | airtel-money | bank | cash
  currency:  'TZS',                           // ISO 4217
  endpoint:  'https://api.example.com',
  health:    'https://api.example.com/health',

  // Optional — recommended
  network:   'vodacom-tz',
  min_amount: '2500',
  max_amount: '1000000',
  fee_range: '1.5-2.2',                       // a range, not exact fees
  speed:     'seconds',                       // seconds | minutes | hours
  protocols: 'bolt11,nwc,lnurl',
  kyc:       'none'                           // none | light | full
});

publisher.close();
```

The listing is signed with your private key and pushed to three public relays (Damus, nostr.band, nos.lol). Republish any time to update — listings are replaceable, so the newest always wins.

---

## 4. Discover providers

Any wallet, app, or provider can query the directory. No key required.

```js
const { Querier } = require('afri-bitcoin-discovery');

const querier = new Querier();

// Find Lightning → M-Pesa off-ramps in Tanzania
const providers = await querier.find({
  country:   'TZ',
  direction: 'off-ramp',
  rail_out:  'm-pesa'
});

for (const p of providers) {
  console.log(`${p.name}  ${p.fee_range}%  ${p.speed}  ${p.endpoint}`);
}

// Same query, but only return providers whose /health endpoint is live right now:
const healthy = await querier.findHealthy({ country: 'TZ', rail_out: 'm-pesa' });

querier.close();
```

Shortcuts: `findByCountry('KE')`, `findOffRamp('TZ', 'm-pesa')`, `findOnRamp('TZ')`.

---

## 5. Attest — vouch, score, revoke

Discovery without trust is a spam list. Providers vouch for each other; consumers rank by the resulting trust score.

```js
const { Attestation } = require('afri-bitcoin-discovery');

const attestation = new Attestation({ privateKey: process.env.NOSTR_PRIVATE_KEY });

// Vouch for a partner you've worked with
await attestation.vouch(partnerPubkey, {
  rating: 'reliable',
  since:  '2026-01',
  volume: 'medium',
  note:   'Processed cross-border flows reliably.'
});

// Compute a partner's trust score
const result = await attestation.score(partnerPubkey, {
  knownProviders: [/* pubkeys you recognise */],
  alliancePubkey: process.env.ALLIANCE_PUBKEY   // optional anchor
});
console.log(result);
// { pubkey, score, attestationCount, revocationCount, breakdown: { ALLIANCE, PROVIDER, UNKNOWN, REVOCATION } }

// Withdraw trust (a reason is required)
await attestation.revoke(badPubkey, 'Non-delivery after 3 confirmed complaints');

attestation.close();
```

**Scoring weights:** alliance attestation `+3`, recognised provider `+1`, unknown key `0`, active revocation `-10`. Only recognised keys move the score — in either direction. An unknown key can neither inflate a score nor tank one (sybil resistance).

---

## Run the tests

```bash
node test/run.js          # offline logic suite — no network
LIVE=1 node test/run.js   # full cycle against live public relays
```

---

## The three event kinds

| Kind | Name | Meaning |
|------|------|---------|
| `38383` | Service Listing | "Here's what I can do" |
| `38384` | Attestation | "I vouch for this provider" |
| `38385` | Revocation | "I no longer trust this provider" |

All are parameterized replaceable events (NIP-33) — the newest version always wins.

---

## Settlement is yours

This protocol *introduces* parties. How value actually moves between them — quotes, execution, status — is negotiated directly via each provider's own API. Discovery finds. Attestation vouches. Settlement is yours.

MIT licensed. Built for Africa.
