const net = require('net');
const dns = require('dns').promises;
const { SimplePool, verifyEvent } = require('nostr-tools');
const {
  KINDS,
  DEFAULT_RELAYS,
  DEFAULT_TTL,
  DEFAULT_QUERY_LIMIT,
  MAX_HEALTH_BYTES,
  HEALTH_CONCURRENCY,
  FILTER_TAGS
} = require('./config');

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
      // First-wins: a crafted event can't override an earlier tag by appending
      // a duplicate. Matches the attestation parser's convention.
      if (!(key in tags)) tags[key] = value;
    }

    return {
      pubkey: event.pubkey,
      eventId: event.id,
      publishedAt: new Date(event.created_at * 1000),
      createdAt: event.created_at,

      // Required fields (filterable ones come from single-letter tags)
      id: tags.d,
      version: tags.v || null,
      name: tags.name,
      country: tags[FILTER_TAGS.country],
      direction: tags[FILTER_TAGS.direction],
      rail_in: tags[FILTER_TAGS.rail_in],
      rail_out: tags[FILTER_TAGS.rail_out],
      currency: tags[FILTER_TAGS.currency],
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

      // Extended metadata
      metadata: event.content ? JSON.parse(event.content) : {}
    };
  }

  /**
   * Build the Nostr REQ filter for a discovery query. Extracted so the limit
   * and freshness logic can be unit-tested without hitting a relay.
   * @param {Object} filters
   * @returns {Object} Nostr filter
   */
  _buildFilter(filters = {}) {
    const nostrFilter = {
      kinds: [KINDS.SERVICE_LISTING],
      // Bound the response so a flood of kind-38383 events can't exhaust us.
      limit: filters.limit || DEFAULT_QUERY_LIMIT
    };

    // Server-side filtering via single-letter indexed tags. The relay does the
    // matching (AND across distinct tags), so we don't download the whole
    // kind-38383 population. Also naturally excludes other protocols (e.g.
    // Mostro) that share kind 38383 but lack our `c` tag.
    if (filters.country) nostrFilter['#' + FILTER_TAGS.country] = [filters.country.toUpperCase()];
    if (filters.direction) nostrFilter['#' + FILTER_TAGS.direction] = [filters.direction];
    if (filters.rail_in) nostrFilter['#' + FILTER_TAGS.rail_in] = [filters.rail_in];
    if (filters.rail_out) nostrFilter['#' + FILTER_TAGS.rail_out] = [filters.rail_out];
    if (filters.currency) nostrFilter['#' + FILTER_TAGS.currency] = [filters.currency.toUpperCase()];

    // Only fetch fresh listings by default
    if (filters.freshOnly !== false) {
      const ttl = filters.ttl || DEFAULT_TTL;
      nostrFilter.since = Math.floor(Date.now() / 1000) - ttl;
    }

    return nostrFilter;
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
   * @param {number} [filters.limit] - Max events to fetch (default DEFAULT_QUERY_LIMIT)
   * @returns {Promise<Object[]>} Array of parsed provider objects
   */
  async find(filters = {}) {
    const nostrFilter = this._buildFilter(filters);

    const events = await this.pool.querySync(this.relays, nostrFilter);

    // Parse, then filter client-side (relays don't index custom tag names)
    const providers = events
      // Verify signatures explicitly — do not rely solely on the pool's default.
      // (Construct nothing via spread here; the cached-verification symbol must
      // not be allowed to travel onto a mutated copy.)
      .filter(event => {
        try { return verifyEvent(event); } catch { return false; }
      })
      .map(event => {
        try {
          // Skip events that aren't ours (kind 38383 is shared with other
          // protocols, e.g. Mostro). Our listings always carry a `c` (country)
          // single-letter tag and a `name` tag.
          const hasCountry = event.tags.some(t => t[0] === FILTER_TAGS.country);
          const hasName = event.tags.some(t => t[0] === 'name');
          if (!hasCountry || !hasName) return null;

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
   * Expand an IPv6 literal into 8 16-bit hextets. Handles '::' compression and
   * a trailing dotted-quad IPv4 suffix. Returns null if unparseable.
   * @param {string} ip
   * @returns {number[]|null}
   */
  _expandIpv6(ip) {
    let s = ip.toLowerCase().trim();
    const pct = s.indexOf('%');
    if (pct !== -1) s = s.slice(0, pct); // strip zone id

    // Convert a trailing IPv4 dotted-quad (e.g. ::ffff:127.0.0.1) into two hextets
    const v4 = s.match(/^(.*:)(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (v4) {
      const o = [v4[2], v4[3], v4[4], v4[5]].map(Number);
      if (o.some(n => n > 255)) return null;
      s = v4[1] + (((o[0] << 8) | o[1]).toString(16)) + ':' + (((o[2] << 8) | o[3]).toString(16));
    }

    const halves = s.split('::');
    if (halves.length > 2) return null;
    const head = halves[0] ? halves[0].split(':') : [];
    const tail = halves.length === 2 ? (halves[1] ? halves[1].split(':') : []) : [];

    let parts;
    if (halves.length === 1) {
      if (head.length !== 8) return null;
      parts = head;
    } else {
      const missing = 8 - (head.length + tail.length);
      if (missing < 1) return null;
      parts = [...head, ...Array(missing).fill('0'), ...tail];
    }
    if (parts.length !== 8) return null;

    const out = [];
    for (const p of parts) {
      if (!/^[0-9a-f]{1,4}$/.test(p || '0')) return null;
      out.push(parseInt(p || '0', 16));
    }
    return out;
  }

  /** Two hextets → dotted IPv4 string. @private */
  _hextetsToV4(hi, lo) {
    return `${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`;
  }

  /**
   * Is an IP address in a private, loopback, link-local, or otherwise
   * non-public/reserved range? Pure and synchronous — safe to unit test
   * with literal addresses.
   *
   * Blocks the ranges an SSRF attacker reaches for: cloud metadata
   * (169.254.169.254), loopback, RFC 1918, CGNAT, link-local, multicast,
   * reserved — plus every IPv6 form that embeds an IPv4 address (mapped,
   * compatible, NAT64 64:ff9b::/96, 6to4 2002::/16), which are decoded and
   * re-checked as IPv4.
   *
   * @param {string} ip - An IPv4 or IPv6 address literal
   * @returns {boolean} true if the address must NOT be fetched
   */
  _isBlockedAddress(ip) {
    if (!ip || typeof ip !== 'string') return true; // fail closed

    const family = net.isIP(ip);

    if (family === 6) {
      const h = this._expandIpv6(ip);
      if (!h) return true; // unparseable → fail closed

      const firstSixZero = h.slice(0, 6).every(x => x === 0);

      if (h.every(x => x === 0)) return true;                 // :: unspecified
      if (firstSixZero && h[6] === 0 && h[7] === 1) return true; // ::1 loopback

      // IPv4-mapped ::ffff:a.b.c.d
      if (h.slice(0, 5).every(x => x === 0) && h[5] === 0xffff) {
        return this._isBlockedAddress(this._hextetsToV4(h[6], h[7]));
      }
      // IPv4-compatible ::a.b.c.d (deprecated)
      if (firstSixZero && (h[6] !== 0 || h[7] !== 0)) {
        return this._isBlockedAddress(this._hextetsToV4(h[6], h[7]));
      }
      // NAT64 well-known prefix 64:ff9b::/96
      if (h[0] === 0x0064 && h[1] === 0xff9b && h[2] === 0 && h[3] === 0 && h[4] === 0 && h[5] === 0) {
        return this._isBlockedAddress(this._hextetsToV4(h[6], h[7]));
      }
      // 6to4 2002::/16 — embedded IPv4 in the next 32 bits
      if (h[0] === 0x2002) {
        return this._isBlockedAddress(this._hextetsToV4(h[1], h[2]));
      }

      if ((h[0] & 0xffc0) === 0xfe80) return true;            // fe80::/10 link-local
      if ((h[0] & 0xfe00) === 0xfc00) return true;            // fc00::/7 ULA
      if ((h[0] & 0xff00) === 0xff00) return true;            // ff00::/8 multicast
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
   * Read a JSON body from a fetch Response with a hard byte cap, so a malicious
   * endpoint can't exhaust memory with a huge response. Extracted for testing.
   * @param {Response} response - A fetch Response
   * @param {number} [maxBytes=MAX_HEALTH_BYTES]
   * @returns {Promise<Object|null>} Parsed JSON, or null if oversized/invalid
   */
  async _readCappedJson(response, maxBytes = MAX_HEALTH_BYTES) {
    // Fast reject if the server declares an oversized body.
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes) return null;

    // Stream the body and abort the moment it exceeds the cap (declared length
    // can be absent or lie, so we enforce it while reading).
    if (!response.body || typeof response.body.getReader !== 'function') {
      // Environments without a streamable body: fall back to text() but guard length.
      const text = await response.text();
      if (Buffer.byteLength(text, 'utf8') > maxBytes) return null;
      try { return JSON.parse(text); } catch { return null; }
    }

    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        if (received > maxBytes) {
          try { await reader.cancel(); } catch { /* ignore */ }
          return null;
        }
        chunks.push(value);
      }
    } catch {
      return null;
    }

    try {
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch {
      return null;
    }
  }

  /**
   * Check a provider's health endpoint.
   *
   * The health URL comes from an untrusted listing, so it is validated against
   * the SSRF guard before any request is made (see _isUrlSafe). Redirects are
   * rejected so a public URL cannot pivot to an internal target, and the
   * response body is read with a hard size cap.
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

      const data = await this._readCappedJson(response);
      if (!data) return null;

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
   * Map over items with bounded concurrency. Preserves input order in the
   * output. Prevents an unbounded fan-out of outbound requests (which could
   * exhaust the caller's resources or amplify into a DDoS against a victim URL).
   * @param {any[]} items
   * @param {number} limit - Max in-flight at once
   * @param {(item:any, index:number) => Promise<any>} fn
   * @returns {Promise<any[]>}
   */
  async _mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    const worker = async () => {
      while (next < items.length) {
        const idx = next++;
        results[idx] = await fn(items[idx], idx);
      }
    };
    const n = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({ length: n }, worker));
    return results;
  }

  /**
   * Find providers and check their health, returning only healthy ones.
   * Health checks run with bounded concurrency (HEALTH_CONCURRENCY).
   * @param {Object} filters - Same as find()
   * @returns {Promise<Object[]>} Healthy providers with health data attached
   */
  async findHealthy(filters = {}) {
    const providers = await this.find(filters);

    const results = await this._mapLimit(providers, HEALTH_CONCURRENCY, async (provider) => {
      const health = await this.checkHealth(provider.health);
      if (health && health.healthy) {
        provider.healthData = health;
        return provider;
      }
      return null;
    });

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
