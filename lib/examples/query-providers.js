#!/usr/bin/env node

/**
 * Query the discovery network for providers.
 *
 * Usage:
 *   node examples/query-providers.js
 *   node examples/query-providers.js KE
 *   node examples/query-providers.js TZ m-pesa
 */

const { Querier } = require('../src/querier');

const country = process.argv[2] || 'TZ';
const railOut = process.argv[3] || null;

const querier = new Querier();

async function main() {
  console.log('=== African Bitcoin Service Discovery Protocol ===');
  console.log('=== Querying Providers ===\n');
  console.log('Searching: country=%s%s\n', country, railOut ? ` rail_out=${railOut}` : '');

  try {
    // Build filter
    const filters = { country, freshOnly: false };
    if (railOut) filters.rail_out = railOut;

    const providers = await querier.find(filters);

    if (providers.length === 0) {
      console.log('No providers found matching this query.');
      console.log('\nTip: Make sure a listing has been published first.');
      console.log('Run: NOSTR_PRIVATE_KEY=your_key node examples/publish-listing.js');
    } else {
      console.log('Found %d provider(s):\n', providers.length);

      providers.forEach((p, i) => {
        console.log('--- Provider %d ---', i + 1);
        console.log('  Name:      %s', p.name);
        console.log('  Service:   %s', p.id);
        console.log('  Country:   %s', p.country);
        console.log('  Direction: %s', p.direction);
        console.log('  Rail:      %s → %s', p.rail_in, p.rail_out);
        console.log('  Currency:  %s', p.currency);
        if (p.network) console.log('  Network:   %s', p.network);
        if (p.fee_range) console.log('  Fee range: %s%%', p.fee_range);
        if (p.speed) console.log('  Speed:     %s', p.speed);
        if (p.min_amount) console.log('  Min:       %s %s', p.min_amount, p.currency);
        if (p.max_amount) console.log('  Max:       %s %s', p.max_amount, p.currency);
        if (p.protocols.length) console.log('  Protocols: %s', p.protocols.join(', '));
        if (p.kyc) console.log('  KYC:       %s', p.kyc);
        console.log('  Status:    %s', p.status);
        console.log('  Endpoint:  %s', p.endpoint);
        console.log('  Health:    %s', p.health);
        console.log('  Pubkey:    %s', p.pubkey.substring(0, 20) + '...');
        console.log('  Published: %s', p.publishedAt.toISOString());
        console.log('');
      });
    }
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    querier.close();
    setTimeout(() => process.exit(0), 1000);
  }
}

main();
