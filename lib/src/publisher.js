const { SimplePool, finalizeEvent } = require('nostr-tools');
const { KINDS, DEFAULT_RELAYS, DEFAULT_TTL, FILTER_TAGS, ALT_TEXT, PROTOCOL_VERSION } = require('./config');
const { loadKeys, loadKeysFromEnv } = require('./keys');

class Publisher {
  /**
   * Create a Publisher instance.
   * @param {Object} options
   * @param {string} options.privateKey - Hex-encoded Nostr private key
   * @param {string[]} [options.relays] - Relay URLs (defaults to 3 public relays)
   */
  constructor({ privateKey, relays }) {
    if (!privateKey) {
      throw new Error('privateKey is required');
    }
    const keys = loadKeys(privateKey);
    this.secretKeyBytes = keys.secretKeyBytes;
    this.publicKey = keys.publicKey;
    this.relays = relays || DEFAULT_RELAYS;
    this.pool = new SimplePool();
  }

  /**
   * Create a Publisher from an environment variable.
   * @param {string} [envVar='NOSTR_PRIVATE_KEY']
   * @param {string[]} [relays]
   * @returns {Publisher}
   */
  static fromEnv(envVar = 'NOSTR_PRIVATE_KEY', relays) {
    const keys = loadKeysFromEnv(envVar);
    return new Publisher({ privateKey: keys.privateKey, relays });
  }

  /**
   * Build a service listing event from a config object.
   * @param {Object} listing - Service listing configuration
   * @param {string} listing.id - Unique service ID (e.g. 'provider-a-tz-offramp')
   * @param {string} listing.name - Provider name
   * @param {string} listing.country - ISO 3166-1 alpha-2 country code
   * @param {string} listing.direction - 'off-ramp' | 'on-ramp' | 'both'
   * @param {string} listing.rail_in - 'lightning' | 'on-chain' | 'ecash'
   * @param {string} listing.rail_out - 'm-pesa' | 'mtn-momo' | 'airtel-money' | 'bank' | 'cash'
   * @param {string} listing.currency - ISO 4217 currency code
   * @param {string} listing.endpoint - API base URL
   * @param {string} listing.health - Health check URL
   * @param {string} [listing.status='active'] - 'active' | 'maintenance' | 'offline'
   * @param {string} [listing.network] - Mobile network operator
   * @param {string} [listing.min_amount] - Minimum in local currency
   * @param {string} [listing.max_amount] - Maximum in local currency
   * @param {string} [listing.fee_range] - Fee percentage range
   * @param {string} [listing.speed] - 'seconds' | 'minutes' | 'hours'
   * @param {string} [listing.ttl] - Seconds until stale
   * @param {string} [listing.protocols] - Supported Lightning protocols
   * @param {string} [listing.kyc] - 'none' | 'light' | 'full'
   * @param {string} [listing.heartbeat='daily'] - 'daily' | 'hourly' | 'on-change'
   * @param {Object} [listing.metadata] - Extended metadata for content field
   * @returns {Object} Signed Nostr event
   */
  buildEvent(listing) {
    // Validate required fields
    const required = ['id', 'name', 'country', 'direction', 'rail_in', 'rail_out', 'currency', 'endpoint', 'health'];
    for (const field of required) {
      if (!listing[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Build tags array.
    // Filterable fields use single-letter tags (c/o/i/m/f) so relays index them
    // for server-side filtering. Display fields keep readable multi-letter names.
    const tags = [
      ['d', listing.id],
      ['alt', ALT_TEXT[KINDS.SERVICE_LISTING]],          // NIP-31 human description
      ['v', PROTOCOL_VERSION],                            // protocol version
      [FILTER_TAGS.country, listing.country.toUpperCase()],
      [FILTER_TAGS.direction, listing.direction],
      [FILTER_TAGS.rail_in, listing.rail_in],
      [FILTER_TAGS.rail_out, listing.rail_out],
      [FILTER_TAGS.currency, listing.currency.toUpperCase()],
      ['name', listing.name],
      ['endpoint', listing.endpoint],
      ['health', listing.health],
      ['status', listing.status || 'active']
    ];

    // Add optional tags
    const optional = {
      network: listing.network,
      min_amount: listing.min_amount,
      max_amount: listing.max_amount,
      fee_range: listing.fee_range,
      speed: listing.speed,
      ttl: listing.ttl || String(DEFAULT_TTL),
      protocols: listing.protocols,
      kyc: listing.kyc,
      heartbeat: listing.heartbeat || 'daily'
    };

    for (const [key, value] of Object.entries(optional)) {
      if (value !== undefined && value !== null) {
        tags.push([key, String(value)]);
      }
    }

    // Build and sign the event
    const event = finalizeEvent({
      kind: KINDS.SERVICE_LISTING,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: listing.metadata ? JSON.stringify(listing.metadata) : '{}'
    }, this.secretKeyBytes);

    return event;
  }

  /**
   * Publish a service listing to all configured relays.
   * @param {Object} listing - Service listing configuration (see buildEvent)
   * @returns {Promise<{ success: string[], failed: string[] }>} Results per relay
   */
  async publish(listing) {
    const event = this.buildEvent(listing);
    const results = { success: [], failed: [], eventId: event.id, pubkey: this.publicKey };

    const promises = this.pool.publish(this.relays, event);

    for (let i = 0; i < promises.length; i++) {
      try {
        await promises[i];
        results.success.push(this.relays[i]);
      } catch (err) {
        results.failed.push({ relay: this.relays[i], error: err.message || String(err) });
      }
    }

    return results;
  }

  /**
   * Update status and republish (for maintenance mode, going offline, etc).
   * @param {Object} listing - Full listing config with updated status
   * @returns {Promise<{ success: string[], failed: string[] }>}
   */
  async updateStatus(listing) {
    return this.publish(listing);
  }

  /**
   * Close all relay connections.
   */
  close() {
    this.pool.close(this.relays);
  }
}

module.exports = { Publisher };
