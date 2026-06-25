/**
 * afri-bitcoin-discovery
 *
 * Open protocol for discovering Bitcoin payment services across Africa.
 * Publish a service listing, discover providers, and attest trust — all on Nostr.
 *
 *   const { Publisher, Querier, Attestation, generateKeys } = require('afri-bitcoin-discovery');
 */

const { Publisher } = require('./publisher');
const { Querier } = require('./querier');
const { Attestation } = require('./attestation');
const { generateKeys, loadKeys, loadKeysFromEnv } = require('./keys');
const {
  KINDS,
  DEFAULT_RELAYS,
  DEFAULT_TTL,
  DEFAULT_QUERY_LIMIT,
  MAX_HEALTH_BYTES,
  HEALTH_CONCURRENCY,
  TRUST_WEIGHTS,
  PROTOCOL_VERSION,
  FILTER_TAGS,
  ALT_TEXT,
  VOCAB
} = require('./config');

module.exports = {
  // Core classes
  Publisher,
  Querier,
  Attestation,

  // Key management
  generateKeys,
  loadKeys,
  loadKeysFromEnv,

  // Protocol constants
  KINDS,
  DEFAULT_RELAYS,
  DEFAULT_TTL,
  DEFAULT_QUERY_LIMIT,
  MAX_HEALTH_BYTES,
  HEALTH_CONCURRENCY,
  TRUST_WEIGHTS,
  PROTOCOL_VERSION,
  FILTER_TAGS,
  ALT_TEXT,
  VOCAB
};
