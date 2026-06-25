#!/usr/bin/env node

/**
 * Publish a service listing to the discovery network.
 *
 * Usage:
 *   NOSTR_PRIVATE_KEY=your_hex_key node examples/publish-listing.js
 *
 * Or generate a key first:
 *   node examples/generate-keys.js
 */

const { Publisher } = require('../src/publisher');

// Load private key from environment or use a test key
const privateKey = process.env.NOSTR_PRIVATE_KEY;

if (!privateKey) {
  console.error('Error: NOSTR_PRIVATE_KEY environment variable is not set.');
  console.error('Generate one with: node examples/generate-keys.js');
  console.error('Then run: NOSTR_PRIVATE_KEY=your_key node examples/publish-listing.js');
  process.exit(1);
}

// Create publisher
const publisher = new Publisher({ privateKey });

// Define your service listing
const listing = {
  // Required fields
  id: 'provider-a-tz-offramp',          // unique service ID
  name: 'Provider A',                    // your provider name
  country: 'TZ',                         // ISO country code
  direction: 'off-ramp',                 // off-ramp | on-ramp | both
  rail_in: 'lightning',                  // what comes in
  rail_out: 'm-pesa',                    // what goes out
  currency: 'TZS',                       // ISO currency code
  endpoint: 'https://api.example.com',   // your API URL
  health: 'https://api.example.com/health', // your health endpoint

  // Optional fields
  network: 'vodacom-tz',                // mobile network
  min_amount: '2500',                    // minimum in local currency
  max_amount: '1000000',                 // maximum in local currency
  fee_range: '1.5-2.2',                 // fee percentage range
  speed: 'seconds',                      // seconds | minutes | hours
  protocols: 'bolt11,nwc,lnurl',        // supported Lightning protocols
  kyc: 'none',                           // none | light | full

  // Extended metadata (optional)
  metadata: {
    description: 'Lightning to M-Pesa off-ramp',
    website: 'https://example.com',
    support: 'support@example.com'
  }
};

async function main() {
  console.log('=== African Bitcoin Service Discovery Protocol ===');
  console.log('=== Publishing Service Listing ===\n');
  console.log('Provider:', listing.name);
  console.log('Service:', listing.id);
  console.log('Country:', listing.country);
  console.log('Direction:', listing.direction);
  console.log('Rail:', listing.rail_in, '→', listing.rail_out);
  console.log('');

  try {
    const results = await publisher.publish(listing);

    console.log('Event ID:', results.eventId);
    console.log('Public key:', results.pubkey);
    console.log('');

    if (results.success.length > 0) {
      console.log('Published to:');
      results.success.forEach(r => console.log('  ✓', r));
    }

    if (results.failed.length > 0) {
      console.log('Failed:');
      results.failed.forEach(f => console.log('  ✗', f.relay, '-', f.error));
    }

    console.log('\nDone.');
  } catch (err) {
    console.error('Error:', err.message);
  } finally {
    publisher.close();
    // Give connections time to close cleanly
    setTimeout(() => process.exit(0), 1000);
  }
}

main();
