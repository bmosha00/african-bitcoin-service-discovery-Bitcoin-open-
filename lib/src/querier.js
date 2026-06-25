const { SimplePool } = require('nostr-tools');
const { KINDS, DEFAULT_RELAYS, DEFAULT_TTL } = require('./config');

class Querier {
  /**
   * Create a Querier instance.
   * @param {Object} [options]
   * @param {string[]} [options.relays] - Relay URLs (defaults to 3 public relays)
   */
  constructor({ relays } = {}) {
    this.relays = relays || DEFAULT_RELAYS;
    this.pool = new SimplePool();
  }

  /**
   * Parse a raw Nostr event into a clean provider object.
   * @param {Object} event - Raw Nostr event
   * @returns {Object} Parsed provider
   */
  _parseEvent(event) {
    const tags = {};
    for (const [key, value] of event.tags) {
      tags[key] = value;
    }

    return {
      pubkey: event.pubkey,
      eventId: event.id,
      publishedAt: new Date(event.created_at * 1000),
      createdAt: event.created_at,

      // Required fields
      id: tags.d,
      name: tags.name,
      country: tags.country,
      direction: tags.direction,
      rail_in: tags.rail_in,
      rail_out: tags.rail_out,
      currency: tags.currency,
      endpoint: tags.endpoint,
      health: tags.health,
      status: tags.status,

      // Optional fields
      network: tags.network || null,
      min_amount: tags.min_amount || null,
      max_amount: tags.max_amount || null,
      fee_range: tags.fee_range || null,
      speed: tags.speed || null,
      ttl: tags.ttl || null,
      protocols: tags.protocols ? tags.protocols.split(',') : [],
      kyc: tags.kyc || null,
      heartbeat: tags.heartbeat || null,

      // Extended metadata
      metadata: event.content ? JSON.parse(event.content) : {}
    };
  }

  /**
   * Find providers matching the given filters.
   * @param {Object} filters
   * @param {string} [filters.country] - ISO 3166-1 alpha-2 country code
   * @param {string} [filters.direction] - 'off-ramp' | 'on-ramp' | 'both'
   * @param {string} [filters.rail_in] - 'lightning' | 'on-chain' | 'ecash'
   * @param {string} [filters.rail_out] - 'm-pesa' | 'mtn-momo' | 'airtel-money' | 'bank' | 'cash'
   * @param {string} [filters.currency] - ISO 4217 currency code
   * @param {boolean} [filters.freshOnly=true] - Only return listings within TTL
   * @returns {Promise<Object[]>} Array of parsed provider objects
   */
  async find(filters = {}) {
    const nostrFilter = {
      kinds: [KINDS.SERVICE_LISTING]
    };

    // Only fetch fresh listings by default
    if (filters.freshOnly !== false) {
      const ttl = filters.ttl || DEFAULT_TTL;
      nostrFilter.since = Math.floor(Date.now() / 1000) - ttl;
    }

    const events = await this.pool.querySync(this.relays, nostrFilter);

    // Parse, then filter client-side (relays don't index custom tag names)
    const providers = events
      .map(event => {
        try {
          // Skip events that don't have our expected tags (other protocols use kind 38383)
          const hasNameTag = event.tags.some(t => t[0] === 'name');
          const hasCountryTag = event.tags.some(t => t[0] === 'country');
          if (!hasNameTag || !hasCountryTag) return null;

          return this._parseEvent(event);
        } catch (err) {
          return null;
        }
      })
      .filter(p => p !== null)
      .filter(p => {
        // Client-side tag filtering
        if (filters.country && p.country !== filters.country.toUpperCase()) return false;
        if (filters.direction && p.direction !== filters.direction) return false;
        if (filters.rail_in && p.rail_in !== filters.rail_in) return false;
        if (filters.rail_out && p.rail_out !== filters.rail_out) return false;
        if (filters.currency && p.currency !== filters.currency.toUpperCase()) return false;
        return true;
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    // Deduplicate by service ID (keep most recent)
    const seen = new Set();
    return providers.filter(p => {
      const key = p.pubkey + ':' + p.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Find providers by country shorthand.
   * @param {string} country - ISO country code
   * @returns {Promise<Object[]>}
   */
  async findByCountry(country) {
    return this.find({ country });
  }

  /**
   * Find off-ramp providers for a specific country and rail.
   * @param {string} country - ISO country code
   * @param {string} railOut - 'm-pesa' | 'mtn-momo' | etc.
   * @returns {Promise<Object[]>}
   */
  async findOffRamp(country, railOut) {
    return this.find({ country, direction: 'off-ramp', rail_out: railOut });
  }

  /**
   * Find on-ramp providers for a specific country.
   * @param {string} country - ISO country code
   * @returns {Promise<Object[]>}
   */
  async findOnRamp(country) {
    return this.find({ country, direction: 'on-ramp' });
  }

  /**
   * Check a provider's health endpoint.
   * @param {string} healthUrl - The provider's health URL
   * @param {number} [timeout=5000] - Timeout in milliseconds
   * @returns {Promise<Object|null>} Health data or null if unreachable
   */
  async checkHealth(healthUrl, timeout = 5000) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(healthUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });

      clearTimeout(timer);

      if (!response.ok) return null;

      const data = await response.json();
      return {
        status: data.status,
        uptime: data.uptime_24h || null,
        speed: data.avg_speed_seconds || null,
        capacity: data.capacity || null,
        lastTransaction: data.last_transaction || null,
        version: data.version || null,
        healthy: data.status === 'active'
      };
    } catch (err) {
      return null;
    }
  }

  /**
   * Find providers and check their health, returning only healthy ones.
   * @param {Object} filters - Same as find()
   * @returns {Promise<Object[]>} Healthy providers with health data attached
   */
  async findHealthy(filters = {}) {
    const providers = await this.find(filters);

    const results = await Promise.all(
      providers.map(async (provider) => {
        const health = await this.checkHealth(provider.health);
        if (health && health.healthy) {
          provider.healthData = health;
          return provider;
        }
        return null;
      })
    );

    return results.filter(p => p !== null);
  }

  /**
   * Close all relay connections.
   */
  close() {
    this.pool.close(this.relays);
  }
}

module.exports = { Querier };
