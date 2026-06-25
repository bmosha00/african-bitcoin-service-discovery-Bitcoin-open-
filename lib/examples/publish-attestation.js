#!/usr/bin/env node

/**
 * Vouch for a provider, revoke trust, or check a trust score.
 *
 * Usage:
 *   NOSTR_PRIVATE_KEY=your_hex_key node examples/publish-attestation.js vouch <target_pubkey>
 *   NOSTR_PRIVATE_KEY=your_hex_key node examples/publish-attestation.js revoke <target_pubkey> "reason"
 *   NOSTR_PRIVATE_KEY=your_hex_key node examples/publish-attestation.js score <target_pubkey>
 *
 * Generate a key first with:
 *   node examples/generate-keys.js
 */

const { Attestation } = require('../src/attestation');

const privateKey = process.env.NOSTR_PRIVATE_KEY;
const action = process.argv[2];
const target = process.argv[3];
const reason = process.argv[4];

if (!privateKey) {
  console.error('Error: NOSTR_PRIVATE_KEY environment variable is not set.');
  console.error('Generate one with: node examples/generate-keys.js');
  process.exit(1);
}

if (!action || !target) {
  console.error('Usage:');
  console.error('  node examples/publish-attestation.js vouch  <target_pubkey>');
  console.error('  node examples/publish-attestation.js revoke <target_pubkey> "reason"');
  console.error('  node examples/publish-attestation.js score  <target_pubkey>');
  process.exit(1);
}

const attestation = new Attestation({ privateKey });

function printResults(results) {
  console.log('Event ID:', results.eventId);
  console.log('Signed by:', results.pubkey);
  console.log('');
  if (results.success.length > 0) {
    console.log('Published to:');
    results.success.forEach(r => console.log('  ✓', r));
  }
  if (results.failed.length > 0) {
    console.log('Failed:');
    results.failed.forEach(f => console.log('  ✗', f.relay, '-', f.error));
  }
}

async function main() {
  console.log('=== African Bitcoin Service Discovery Protocol ===');
  console.log('=== Attestation ===\n');

  try {
    if (action === 'vouch') {
      console.log('Vouching for:', target, '\n');
      const results = await attestation.vouch(target, {
        rating: 'reliable',
        since: '2026-01',
        volume: 'medium',
        note: 'Processed cross-border flows reliably.'
      });
      printResults(results);

    } else if (action === 'revoke') {
      if (!reason) {
        console.error('A reason is required to revoke. Wrap it in quotes.');
        process.exit(1);
      }
      console.log('Revoking trust from:', target);
      console.log('Reason:', reason, '\n');
      const results = await attestation.revoke(target, reason, {
        effective: new Date().toISOString().slice(0, 10)
      });
      printResults(results);

    } else if (action === 'score') {
      console.log('Scoring provider:', target, '\n');
      // In production, pass real knownProviders and the alliance pubkey.
      const result = await attestation.score(target, {
        knownProviders: [],
        alliancePubkey: process.env.ALLIANCE_PUBKEY || null
      });
      console.log('Trust score:      ', result.score);
      console.log('Attestations:     ', result.attestationCount);
      console.log('Active revocations:', result.revocationCount);
      console.log('Breakdown:        ', JSON.stringify(result.breakdown));

    } else {
      console.error('Unknown action:', action);
      console.error('Use one of: vouch | revoke | score');
      process.exit(1);
    }

    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    attestation.close();
    setTimeout(() => process.exit(0), 1000);
  }
}

main();
