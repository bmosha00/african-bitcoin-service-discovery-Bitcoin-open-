#!/usr/bin/env node

/**
 * Generate a new Nostr keypair for the service discovery protocol.
 * Run once, save the private key securely.
 *
 * Usage: node examples/generate-keys.js
 */

const { generateKeys } = require('../src/keys');

const keys = generateKeys();

console.log('=== African Bitcoin Service Discovery Protocol ===');
console.log('=== New Nostr Keypair Generated ===\n');
console.log('Public key (share freely):');
console.log(' ', keys.publicKey);
console.log('\nPrivate key (KEEP SECRET — store in .env):');
console.log(' ', keys.privateKey);
console.log('\nAdd to your .env file:');
console.log(`  NOSTR_PRIVATE_KEY=${keys.privateKey}`);
console.log('\nThis keypair is your provider identity on the discovery network.');
console.log('Losing the private key means losing control of your listing.');
