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

const { verifyEvent } = require('nostr-tools');
const {
  Publisher,
  Querier,
  Attestation,
  generateKeys,
  loadKeys,
  KINDS,
  DEFAULT_RELAYS,
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
  check('country was uppercased', lt.country === 'TZ');
  check('currency was uppercased', lt.currency === 'TZS');
  check('default ttl applied', lt.ttl === '90000');
  check('default status active', lt.status === 'active');
  let threw = false;
  try { publisher.buildEvent({ name: 'x' }); } catch { threw = true; }
  check('missing required field throws', threw);
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
  check('attestation signed by bob', vouchEvent.pubkey === bob.publicKey);
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

async function main() {
  await runOffline();
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
