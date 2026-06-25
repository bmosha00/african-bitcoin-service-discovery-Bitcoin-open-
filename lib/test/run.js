#!/usr/bin/env node

/**
 * Test suite for afri-bitcoin-discovery.
 *
 *   node test/run.js            # offline logic tests (no network) — always run
 *   LIVE=1 node test/run.js     # also run the full live cycle against public relays
 *
 * The offline suite proves the cryptography (sign/verify) and the trust-scoring
 * math are correct, deterministically, without touching the network. The live
 * suite proves the end-to-end integration: publish a listing, discover it,
 * attest to it, and read back a trust score from real Nostr relays.
 */

const { verifyEvent, finalizeEvent, generateSecretKey } = require('nostr-tools');
const {
  Publisher,
  Querier,
  Attestation,
  generateKeys,
  loadKeys,
  KINDS,
  DEFAULT_RELAYS,
  DEFAULT_QUERY_LIMIT,
  TRUST_WEIGHTS
} = require('../src/index');

let passed = 0;
let failed = 0;

function check(name, condition) {
  if (condition) {
    console.log('  ✓', name);
    passed++;
  } else {
    console.log('  ✗', name);
    failed++;
  }
}

function section(title) {
  console.log('\n' + title);
}

// ---------------------------------------------------------------------------
// Offline suite — no network
// ---------------------------------------------------------------------------

function runOffline() {
  console.log('=== Offline logic tests ===');

  // --- Exports wired correctly ---
  section('Package exports');
  check('Publisher is a class', typeof Publisher === 'function');
  check('Querier is a class', typeof Querier === 'function');
  check('Attestation is a class', typeof Attestation === 'function');
  check('generateKeys is a function', typeof generateKeys === 'function');
  check('KINDS has all three kinds',
    KINDS.SERVICE_LISTING === 38383 && KINDS.ATTESTATION === 38384 && KINDS.REVOCATION === 38385);
  check('DEFAULT_RELAYS has 3 relays', Array.isArray(DEFAULT_RELAYS) && DEFAULT_RELAYS.length === 3);

  // --- Keys ---
  section('Keys');
  const alice = generateKeys();
  const bob = generateKeys();
  check('generateKeys returns 64-char private key', alice.privateKey.length === 64);
  check('generateKeys returns a public key', !!alice.publicKey && alice.publicKey.length === 64);
  check('loadKeys derives the same public key',
    loadKeys(alice.privateKey).publicKey === alice.publicKey);
  check('two keypairs are distinct', alice.publicKey !== bob.publicKey);

  // --- Listing event: build, sign, verify ---
  section('Service listing event (kind 38383)');
  const publisher = new Publisher({ privateKey: alice.privateKey });
  const listing = {
    id: 'provider-a-tz-offramp',
    name: 'Provider A',
    country: 'tz',                 // lowercase on purpose — should be uppercased
    direction: 'off-ramp',
    rail_in: 'lightning',
    rail_out: 'm-pesa',
    currency: 'tzs',
    endpoint: 'https://api.example.com',
    health: 'https://api.example.com/health',
    fee_range: '1.5-2.2',
    speed: 'seconds'
  };
  const listingEvent = publisher.buildEvent(listing);
  const lt = Object.fromEntries(listingEvent.tags.map(t => [t[0], t[1]]));
  check('listing kind is 38383', listingEvent.kind === KINDS.SERVICE_LISTING);
  check('listing signature verifies', verifyEvent(listingEvent));
  check('country in single-letter c tag, uppercased', lt.c === 'TZ');
  check('currency in single-letter f tag, uppercased', lt.f === 'TZS');
  check('direction in o tag', lt.o === 'off-ramp');
  check('rail_in in i tag', lt.i === 'lightning');
  check('rail_out in m tag', lt.m === 'm-pesa');
  check('no legacy multi-letter country tag', lt.country === undefined);
  check('alt tag present (NIP-31)', lt.alt === 'African Bitcoin payment service listing');
  check('version tag is 0.2', lt.v === '0.2');
  check('default ttl applied', lt.ttl === '90000');
  check('default status active', lt.status === 'active');
  let threw = false;
  try { publisher.buildEvent({ name: 'x' }); } catch { threw = true; }
  check('missing required field throws', threw);

  // --- Input validation (#8 + audit LOW: ungraceful non-string) ---
  const base = { id: 's', name: 'P', country: 'TZ', direction: 'off-ramp', rail_in: 'lightning',
    rail_out: 'm-pesa', currency: 'TZS', endpoint: 'https://x.example', health: 'https://x.example/h' };
  const rejects = (patch, label) => {
    let t = false;
    try { publisher.buildEvent({ ...base, ...patch }); } catch { t = true; }
    check('rejects ' + label, t);
  };
  rejects({ country: 255 }, 'non-string country (clear error, not TypeError)');
  rejects({ country: 'TZZ' }, 'bad country code (3 letters)');
  rejects({ currency: 'TZ' }, 'bad currency code (2 letters)');
  rejects({ direction: 'offramp' }, 'direction not in vocabulary');
  rejects({ rail_out: 'mpesa' }, 'rail_out not in vocabulary');
  rejects({ rail_in: 'ln' }, 'rail_in not in vocabulary');
  rejects({ endpoint: 'http://x.example' }, 'non-https endpoint');
  rejects({ health: 'not-a-url' }, 'malformed health url');
  rejects({ kyc: 'maybe' }, 'kyc not in vocabulary');
  let okValid = true;
  try { publisher.buildEvent({ ...base, country: 'ke', currency: 'kes' }); } catch { okValid = false; }
  check('accepts valid listing (lowercase country/currency)', okValid);
  publisher.close();

  // --- Attestation event: build, sign, verify ---
  section('Attestation event (kind 38384)');
  const att = new Attestation({ privateKey: bob.privateKey });
  const vouchEvent = att.buildVouchEvent(alice.publicKey, {
    rating: 'reliable', since: '2026-01', volume: 'medium', note: 'solid partner'
  });
  const vt = Object.fromEntries(vouchEvent.tags.map(t => [t[0], t[1]]));
  check('attestation kind is 38384', vouchEvent.kind === KINDS.ATTESTATION);
  check('attestation signature verifies', verifyEvent(vouchEvent));
  check('attestation targets alice via p tag', vt.p === alice.publicKey);
  check('attestation p tag is hex (64 chars), not npub', /^[0-9a-f]{64}$/.test(vt.p));
  check('attestation signed by bob', vouchEvent.pubkey === bob.publicKey);
  check('attestation alt tag present', vt.alt === 'African Bitcoin provider attestation (vouch)');
  check('attestation version tag is 0.2', vt.v === '0.2');
  check('vouch d-tag uses full pubkey (no 16-char prefix collision)', vt.d === 'vouch-' + alice.publicKey);
  let badPkThrew = false;
  try { att.buildVouchEvent('npub1nothex'); } catch { badPkThrew = true; }
  check('vouch rejects non-hex pubkey (npub)', badPkThrew);
  check('rating preserved', vt.rating === 'reliable');
  let selfThrew = false;
  try { att.buildVouchEvent(bob.publicKey); } catch { selfThrew = true; }
  check('self-attestation throws', selfThrew);

  // --- Revocation event: build, sign, verify ---
  section('Revocation event (kind 38385)');
  const revEvent = att.buildRevokeEvent(alice.publicKey, 'non-delivery', { effective: '2026-09-15' });
  const rt = Object.fromEntries(revEvent.tags.map(t => [t[0], t[1]]));
  check('revocation kind is 38385', revEvent.kind === KINDS.REVOCATION);
  check('revocation signature verifies', verifyEvent(revEvent));
  check('revocation action is revoked', rt.action === 'revoked');
  check('revocation reason preserved', rt.reason === 'non-delivery');
  check('revocation alt tag present', rt.alt === 'African Bitcoin provider trust revocation');
  check('revocation version tag is 0.2', rt.v === '0.2');
  let noReasonThrew = false;
  try { att.buildRevokeEvent(alice.publicKey, ''); } catch { noReasonThrew = true; }
  check('revocation without reason throws', noReasonThrew);

  // --- Trust scoring math (deterministic, pre-fetched events) ---
  section('Trust scoring');
  const allianceKey = generateKeys().publicKey;
  const knownProvider = generateKeys().publicKey;
  const unknownProvider = generateKeys().publicKey;
  const target = generateKeys().publicKey;

  // Helper to fabricate parsed attestation/revocation objects
  const mkAtt = (attester) => ({ attester, target, createdAt: 1, eventId: attester });
  const mkRev = (revoker) => ({ revoker, target, action: 'revoked', createdAt: 1, eventId: revoker });

  // Case 1: alliance + known + unknown attestations, no revocation
  // expected: +3 (alliance) +1 (known) +0 (unknown) = 4
  return att.score(target, {
    knownProviders: [knownProvider],
    alliancePubkey: allianceKey,
    attestations: [mkAtt(allianceKey), mkAtt(knownProvider), mkAtt(unknownProvider)],
    revocations: []
  }).then(s1 => {
    check('alliance+provider+unknown scores 4',
      s1.score === TRUST_WEIGHTS.ALLIANCE + TRUST_WEIGHTS.PROVIDER + TRUST_WEIGHTS.UNKNOWN);
    check('breakdown counts are correct',
      s1.breakdown.ALLIANCE === 1 && s1.breakdown.PROVIDER === 1 && s1.breakdown.UNKNOWN === 1);

    // Case 2: same attestations + an alliance revocation → 4 + (-10) = -6
    return att.score(target, {
      knownProviders: [knownProvider],
      alliancePubkey: allianceKey,
      attestations: [mkAtt(allianceKey), mkAtt(knownProvider), mkAtt(unknownProvider)],
      revocations: [mkRev(allianceKey)]
    });
  }).then(s2 => {
    check('alliance revocation drops score to -6', s2.score === 4 + TRUST_WEIGHTS.REVOCATION);
    check('revocation counted', s2.revocationCount === 1);

    // Case 3: revocation from an UNKNOWN key must be ignored (sybil resistance)
    return att.score(target, {
      knownProviders: [knownProvider],
      alliancePubkey: allianceKey,
      attestations: [mkAtt(knownProvider)],
      revocations: [mkRev(unknownProvider)]
    });
  }).then(s3 => {
    check('unknown-key revocation is ignored', s3.score === TRUST_WEIGHTS.PROVIDER);
    check('unknown-key revocation not counted', s3.revocationCount === 0);
    att.close();
  });
}

// ---------------------------------------------------------------------------
// Live suite — real relays (only with LIVE=1)
// ---------------------------------------------------------------------------

async function runLive() {
  console.log('\n=== Live relay cycle (publish → discover → attest → score) ===');
  console.log('Relays:', DEFAULT_RELAYS.join(', '), '\n');

  const provider = generateKeys();   // the provider being listed + vouched for
  const voucher = generateKeys();    // a second provider that vouches
  const serviceId = 'e2e-test-' + Date.now();

  const publisher = new Publisher({ privateKey: provider.privateKey });
  const querier = new Querier();
  const attestation = new Attestation({ privateKey: voucher.privateKey });

  try {
    // 1. Publish a listing
    const pub = await publisher.publish({
      id: serviceId,
      name: 'E2E Test Provider',
      country: 'TZ',
      direction: 'off-ramp',
      rail_in: 'lightning',
      rail_out: 'm-pesa',
      currency: 'TZS',
      endpoint: 'https://example.com',
      health: 'https://example.com/health',
      fee_range: '1.5-2.0',
      speed: 'seconds'
    });
    check('listing published to >=1 relay', pub.success.length >= 1);

    // Give relays a moment to index
    await new Promise(r => setTimeout(r, 2500));

    // 2. Discover it
    const found = await querier.find({ country: 'TZ', freshOnly: true });
    const mine = found.find(p => p.id === serviceId && p.pubkey === provider.publicKey);
    check('published listing discovered back', !!mine);

    // 3. Vouch for the provider
    const vouchRes = await attestation.vouch(provider.publicKey, { rating: 'reliable' });
    check('attestation published to >=1 relay', vouchRes.success.length >= 1);

    await new Promise(r => setTimeout(r, 2500));

    // 4. Read attestations + score (voucher is a "known provider" here)
    const atts = await attestation.getAttestations(provider.publicKey);
    check('attestation fetched back', atts.some(a => a.attester === voucher.publicKey));

    const scored = await attestation.score(provider.publicKey, {
      knownProviders: [voucher.publicKey]
    });
    check('trust score reflects the vouch (+1)', scored.score >= TRUST_WEIGHTS.PROVIDER);
  } finally {
    publisher.close();
    querier.close();
    attestation.close();
  }
}

// ---------------------------------------------------------------------------
// SSRF guard suite — offline, no network (uses IP literals + localhost)
// ---------------------------------------------------------------------------

async function runSsrf() {
  console.log('\n=== SSRF guard (health-endpoint URL validation) ===');
  const q = new Querier();

  section('Blocked address ranges');
  const blocked = [
    '169.254.169.254', // cloud metadata
    '127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '172.31.255.255',
    '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', 'fe80::1', 'fc00::1', '::ffff:127.0.0.1'
  ];
  check('all private/reserved IPs are blocked',
    blocked.every(ip => q._isBlockedAddress(ip) === true));

  section('Public addresses allowed');
  const publicIps = ['8.8.8.8', '1.1.1.1', '9.9.9.9', '172.15.0.1', '172.32.0.1'];
  check('public IPs are not blocked',
    publicIps.every(ip => q._isBlockedAddress(ip) === false));

  section('URL safety (scheme + host)');
  const reject = [
    'http://example.com',            // not https
    'https://169.254.169.254/',      // metadata
    'https://127.0.0.1/health',      // loopback
    'https://10.0.0.5/',             // rfc1918
    'https://192.168.1.1/',          // rfc1918
    'https://[::1]/',                // ipv6 loopback
    'https://localhost/health',      // localhost by name
    'file:///etc/passwd',            // bad scheme
    'not a url',                     // unparseable
    // IP-encoding / IPv6-embedding bypass attempts:
    'https://2130706433/',           // decimal 127.0.0.1
    'https://0x7f000001/',           // hex 127.0.0.1
    'https://[::ffff:127.0.0.1]/',   // ipv4-mapped (dotted)
    'https://[::ffff:7f00:1]/',      // ipv4-mapped (hex)
    'https://[64:ff9b::7f00:1]/',    // NAT64 loopback
    'https://[64:ff9b::a9fe:a9fe]/', // NAT64 of metadata 169.254.169.254
    'https://[2002:7f00:1::]/',      // 6to4 of 127.0.0.1
    'https://[::7f00:1]/'            // ipv4-compatible 127.0.0.1
  ];
  for (const u of reject) {
    check('rejects ' + u, (await q._isUrlSafe(u)) === false);
  }

  const allow = [
    'https://1.1.1.1/health',
    'https://9.9.9.9/health',
    'https://[2606:4700:4700::1111]/'  // public IPv6 (Cloudflare) — must NOT false-positive
  ];
  for (const u of allow) {
    check('allows ' + u, (await q._isUrlSafe(u)) === true);
  }

  q.close();
}

// ---------------------------------------------------------------------------
// Hardening suite (MEDIUM fixes) — offline
//   #2 explicit signature verification
//   #3 bounded query limit
//   #4 health-check response-size cap + bounded concurrency
// ---------------------------------------------------------------------------

function mockResponse(body, { contentLength = null, chunkSize = 8 } = {}) {
  const bytes = Buffer.from(body, 'utf8');
  let pos = 0;
  return {
    ok: true,
    headers: { get: (h) => (h.toLowerCase() === 'content-length' ? contentLength : null) },
    body: {
      getReader() {
        return {
          read() {
            if (pos >= bytes.length) return Promise.resolve({ done: true });
            const end = Math.min(pos + chunkSize, bytes.length);
            const value = bytes.subarray(pos, end);
            pos = end;
            return Promise.resolve({ done: false, value });
          },
          cancel() { pos = bytes.length; return Promise.resolve(); }
        };
      }
    },
    text() { return Promise.resolve(body); }
  };
}

async function runHardening() {
  console.log('\n=== Hardening (explicit verify, query limit, health caps) ===');
  const q = new Querier();

  // --- #2 explicit signature verification ---
  section('Signature verification (#2)');
  const sk = generateSecretKey();
  const ev = finalizeEvent({
    kind: KINDS.ATTESTATION, created_at: Math.floor(Date.now() / 1000),
    tags: [['d', 'x'], ['p', 'a'.repeat(64)], ['rating', 'reliable']], content: ''
  }, sk);
  check('genuine event verifies', verifyEvent(ev) === true);
  // Forge by rebuilding as a clean object (no cached verification symbol)
  const forged = { id: ev.id, pubkey: 'b'.repeat(64), created_at: ev.created_at,
    kind: ev.kind, tags: ev.tags, content: ev.content, sig: ev.sig };
  check('pubkey-swapped event rejected', verifyEvent(forged) === false);
  const tampered = { id: ev.id, pubkey: ev.pubkey, created_at: ev.created_at, kind: ev.kind,
    tags: [['d', 'x'], ['p', 'a'.repeat(64)], ['rating', 'HIJACKED']], content: ev.content, sig: ev.sig };
  check('tampered-tag event rejected', verifyEvent(tampered) === false);

  // --- #3 bounded query limit + v0.2 server-side single-letter filters ---
  section('Query limit + single-letter filters (#3 / v0.2)');
  const f1 = q._buildFilter({});
  check('filter targets service-listing kind', f1.kinds[0] === KINDS.SERVICE_LISTING);
  check('filter applies default limit', f1.limit === DEFAULT_QUERY_LIMIT);
  check('default is freshOnly (since set)', typeof f1.since === 'number');
  const f2 = q._buildFilter({ limit: 10, freshOnly: false });
  check('limit override respected', f2.limit === 10);
  check('freshOnly:false omits since', f2.since === undefined);
  const f3 = q._buildFilter({ country: 'tz', direction: 'off-ramp', rail_out: 'm-pesa', freshOnly: false });
  check('country → server-side #c (uppercased)', JSON.stringify(f3['#c']) === '["TZ"]');
  check('direction → server-side #o', JSON.stringify(f3['#o']) === '["off-ramp"]');
  check('rail_out → server-side #m', JSON.stringify(f3['#m']) === '["m-pesa"]');
  check('no legacy #country filter key', f3['#country'] === undefined);
  // round-trip: build a listing, parse it back through the single-letter tags
  const rtPub = new Publisher({ privateKey: generateKeys().privateKey });
  const rtEvent = rtPub.buildEvent({
    id: 's', name: 'P', country: 'ke', direction: 'on-ramp', rail_in: 'lightning',
    rail_out: 'mtn-momo', currency: 'kes', endpoint: 'https://x', health: 'https://x/h'
  });
  const rt = q._parseEvent(rtEvent);
  check('round-trip country', rt.country === 'KE');
  check('round-trip direction', rt.direction === 'on-ramp');
  check('round-trip rail_out', rt.rail_out === 'mtn-momo');
  check('round-trip version', rt.version === '0.2');
  // first-wins: a crafted duplicate tag cannot override the legitimate first value
  const dupEvent = { pubkey: 'a'.repeat(64), id: 'x', created_at: 1, content: '{}',
    tags: [['c', 'TZ'], ['name', 'P'], ['c', 'KE'], ['m', 'm-pesa'], ['m', 'bank']] };
  const dup = q._parseEvent(dupEvent);
  check('duplicate tag uses first value (country)', dup.country === 'TZ');
  check('duplicate tag uses first value (rail_out)', dup.rail_out === 'm-pesa');
  rtPub.close();

  // --- #4 health-check response-size cap ---
  section('Health-check size cap (#4)');
  const good = await q._readCappedJson(mockResponse('{"status":"active"}'), 1024);
  check('reads small valid JSON', good && good.status === 'active');
  const declaredBig = await q._readCappedJson(mockResponse('{}', { contentLength: 999999 }), 1024);
  check('rejects oversized declared content-length', declaredBig === null);
  const streamedBig = await q._readCappedJson(mockResponse('x'.repeat(5000), { contentLength: null }), 1024);
  check('rejects oversized streamed body (lying/absent length)', streamedBig === null);
  const notJson = await q._readCappedJson(mockResponse('not json', { contentLength: null }), 1024);
  check('rejects invalid JSON within cap', notJson === null);

  // --- #4 bounded concurrency ---
  section('Bounded concurrency (#4)');
  let active = 0, maxActive = 0;
  const items = Array.from({ length: 20 }, (_, i) => i);
  const out = await q._mapLimit(items, 5, async (x) => {
    active++; maxActive = Math.max(maxActive, active);
    await new Promise(r => setTimeout(r, 3));
    active--;
    return x * 2;
  });
  check('mapLimit preserves order', out.every((v, i) => v === i * 2));
  check('mapLimit completes all items', out.length === 20);
  check('mapLimit never exceeds concurrency cap', maxActive > 0 && maxActive <= 5);

  q.close();
}

// ---------------------------------------------------------------------------

async function main() {
  await runOffline();
  await runSsrf();
  await runHardening();
  if (process.env.LIVE === '1') {
    await runLive();
  } else {
    console.log('\n(Skipping live relay tests. Run with LIVE=1 to enable.)');
  }

  console.log('\n----------------------------------------');
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log('----------------------------------------');

  // Let relay sockets close cleanly, then exit with proper code
  setTimeout(() => process.exit(failed === 0 ? 0 : 1), 1200);
}

main().catch(err => {
  console.error('\nFatal test error:', err);
  process.exit(1);
});
