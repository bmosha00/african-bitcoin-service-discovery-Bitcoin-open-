const { generateSecretKey, getPublicKey, utils } = require('nostr-tools');
const { bytesToHex, hexToBytes } = utils;

/**
 * Generate a new Nostr keypair.
 * @returns {{ privateKey: string, publicKey: string }} Hex-encoded keypair
 */
function generateKeys() {
  const sk = generateSecretKey();
  const pk = getPublicKey(sk);
  return {
    privateKey: bytesToHex(sk),
    publicKey: pk
  };
}

/**
 * Load a private key from hex string and derive the public key.
 * @param {string} privateKeyHex - Hex-encoded private key
 * @returns {{ privateKey: string, publicKey: string, secretKeyBytes: Uint8Array }}
 */
function loadKeys(privateKeyHex) {
  if (!privateKeyHex || typeof privateKeyHex !== 'string') {
    throw new Error('Private key must be a hex string');
  }
  if (privateKeyHex.length !== 64) {
    throw new Error('Private key must be 64 hex characters (32 bytes)');
  }

  const sk = hexToBytes(privateKeyHex);
  const pk = getPublicKey(sk);

  return {
    privateKey: privateKeyHex,
    publicKey: pk,
    secretKeyBytes: sk
  };
}

/**
 * Load a private key from environment variable.
 * @param {string} [envVar='NOSTR_PRIVATE_KEY'] - Environment variable name
 * @returns {{ privateKey: string, publicKey: string, secretKeyBytes: Uint8Array }}
 */
function loadKeysFromEnv(envVar = 'NOSTR_PRIVATE_KEY') {
  const privateKeyHex = process.env[envVar];
  if (!privateKeyHex) {
    throw new Error(`Environment variable ${envVar} is not set`);
  }
  return loadKeys(privateKeyHex);
}

module.exports = {
  generateKeys,
  loadKeys,
  loadKeysFromEnv
};
