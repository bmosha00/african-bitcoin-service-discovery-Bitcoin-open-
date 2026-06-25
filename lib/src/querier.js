const net = require('net');
const dns = require('dns').promises;
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
   * Is an IP address in a private, loopback, link-local, or otherwise
   * non-public/reserved range? Pure and synchronous — safe to unit test
   * with literal addresses.
   *
   * Blocks the ranges an SSRF attacker reaches for: cloud metadata
   * (169.254.169.254), loopback, RFC 1918, CGNAT, link-local, multicast,
   * reserved, plus the IPv6 equivalents and IPv4-mapped IPv6.
   *
   * @param {string} ip - An IPv4 or IPv6 address literal
   * @returns {boolean} true if the address must NOT be fetched
   */
  _isBlockedAddress(ip) {
    if (!ip || typeof ip !== 'string') return true; // fail closed

    const family = net.isIP(ip);

    // IPv4-mapped / embedded IPv6 (e.g. ::ffff:127.0.0.1, ::ffff:7f00:1) →
    // extract the IPv4 part and check it as v4.
    if (family === 6) {
      const lower = ip.toLowerCase();
      const mapped = lower.match(/(?:::ffff:)(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
      if (mapped) return this._isBlockedAddress(mapped[1]);
      // Hex-form IPv4-mapped (::ffff:7f00:0001)
      const hexMapped = lower.match(/::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
      if (hexMapped) {
        const hi = parseInt(hexMapped[1], 16);
        const lo = parseInt(hexMapped[2], 16);
        const v4 = `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
        return this._isBlockedAddress(v4);
      }
      // Pure IPv6
      if (lower === '::1' || lower === '::') return true;        // loopback / unspecified
      if (lower.startsWith('fe8') || lower.startsWith('fe9') ||
          lower.startsWith('fea') || lower.startsWith('feb')) return true; // fe80::/10 link-local
      if (lower.startsWith('fc') || lower.startsWith('fd')) return true;   // fc00::/7 ULA
      if (lower.startsWith('ff')) return true;                  // ff00::/8 multicast
      return false;
    }

    if (family === 4) {
      const o = ip.split('.').map(Number);
      if (o.length !== 4 || o.some(n => Number.isNaN(n) || n < 0 || n > 255)) return true;
      const [a, b] = o;
      if (a === 0) return true;                                 // 0.0.0.0/8
      if (a === 10) return true;                                // 10.0.0.0/8
      if (a === 127) return true;                               // loopback
      if (a === 169 && b === 254) return true;                  // link-local / metadata
      if (a === 172 && b >= 16 && b <= 31) return true;         // 172.16.0.0/12
      if (a === 192 && b === 168) return true;                  // 192.168.0.0/16
      if (a === 100 && b >= 64 && b <= 127) return true;        // 100.64.0.0/10 CGNAT
      if (a === 198 && (b === 18 || b === 19)) return true;     // 198.18.0.0/15 benchmark
      if (a >= 224) return true;                                // 224+/multicast + reserved + broadcast
      return false;
    }

    return true; // not a valid IP literal → fail closed
  }

  /**
   * Validate that a URL is safe to fetch (SSRF guard).
   *
   * Requires https, blocks localhost by name, and — critically — resolves the
   * hostname and rejects if ANY resolved address is private/reserved. Combined
   * with redirect:'error' on the fetch, this closes the static SSRF cases
   * (cloud metadata, loopback, RFC 1918, redirect pivots).
   *
   * Note: a determined DNS-rebinding attacker could still flip the address
   * between this lookup and the connect. Hardened deployments should pin the
   * connection to the validated IP via a custom dispatcher; for the public-relay
   * threat model this validator + redirect:'error' is the high-value mitigation.
   *
   * @param {string} urlString - The URL to validate
   * @returns {Promise<boolean>} true if safe to fetch
   */
  async _isUrlSafe(urlString) {
    let url;
    try {
      url = new URL(urlString);
    } catch {
      return false; // unparseable
    }

    if (url.protocol !== 'https:') return false; // no http/file/etc.

    let host = url.hostname;
    if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1); // IPv6 literal

    // Reject localhost by name (it may resolve to a loopback not caught by IP rules)
    const lower = host.toLowerCase();
    if (lower === 'localhost' || lower.endsWith('.localhost')) return false;

    // IP literal → check directly, no DNS needed
    if (net.isIP(host)) return !this._isBlockedAddress(host);

    // Hostname → resolve and check EVERY returned address
    let addresses;
    try {
      addresses = await Promise.race([
        dns.lookup(host, { all: true }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('dns timeout')), 3000))
      ]);
    } catch {
      return false; // resolution failed or timed out → fail closed
    }

    if (!Array.isArray(addresses) || addresses.length === 0) return false;
    for (const { address } of addresses) {
      if (this._isBlockedAddress(address)) return false;
    }
    return true;
  }

  /**
   * Check a provider's health endpoint.
   *
   * The health URL comes from an untrusted listing, so it is validated against
   * the SSRF guard before any request is made (see _isUrlSafe). Redirects are
   * rejected so a public URL cannot pivot to an internal target.
   *
   * @param {string} healthUrl - The provider's health URL
   * @param {number} [timeout=5000] - Timeout in milliseconds
   * @returns {Promise<Object|null>} Health data or null if unreachable/unsafe
   */
  async checkHealth(healthUrl, timeout = 5000) {
    // SSRF guard: never fetch a non-https or internal/reserved address.
    if (!(await this._isUrlSafe(healthUrl))) return null;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);

      const response = await fetch(healthUrl, {
        signal: controller.signal,
        redirect: 'error',
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
