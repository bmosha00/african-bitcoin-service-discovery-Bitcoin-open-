const WebSocket = require('ws');

// Polyfill WebSocket for Node.js
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = WebSocket;
}

// Protocol event kinds
const KINDS = {
  SERVICE_LISTING: 38383,
  ATTESTATION: 38384,
  REVOCATION: 38385
};

// Default public Nostr relays
const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://relay.nostr.band',
  'wss://nos.lol'
];

// Default TTL: 25 hours in seconds
const DEFAULT_TTL = 90000;

// Trust scoring weights
const TRUST_WEIGHTS = {
  ALLIANCE: 3,
  PROVIDER: 1,
  UNKNOWN: 0,
  REVOCATION: -10
};

module.exports = {
  KINDS,
  DEFAULT_RELAYS,
  DEFAULT_TTL,
  TRUST_WEIGHTS
};
