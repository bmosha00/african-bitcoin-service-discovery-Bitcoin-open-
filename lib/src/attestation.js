const { SimplePool, finalizeEvent, verifyEvent } = require('nostr-tools');
const { KINDS, DEFAULT_RELAYS, DEFAULT_QUERY_LIMIT, TRUST_WEIGHTS } = require('./config');
const { loadKeys, loadKeysFromEnv } = require('./keys');

class Attestation {
  /**
   * Create an Attestation instance.
   *
   * Attestation both signs (vouch/revoke) and queries (fetch/score), so it
   * needs a private key like the Publisher and a relay pool like the Querier.
   *
   * @param {Object} options
   * @param {string} options.privateKey - Hex-encoded Nostr private key
   * @param {string[]} [options.relays] - Relay URLs (defaults to 3 public relays)
   */
  constructor({ privateKey, relays } = {}) {
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
   * Create an Attestation instance from an environment variable.
   * @param {string} [envVar='NOSTR_PRIVATE_KEY']
   * @param {string[]} [relays]
   * @returns {Attestation}
   */
  static fromEnv(envVar = 'NOSTR_PRIVATE_KEY', relays) {
    const keys = loadKeysFromEnv(envVar);
    return new Attestation({ privateKey: keys.privateKey, relays });
  }

  // ---------------------------------------------------------------------------
  // Building events
  // ---------------------------------------------------------------------------

  /**
   * Build a signed attestation event (kind 38384).
   * @param {string} pubkey - The provider being vouched for (hex pubkey)
   * @param {Object} [options]
   * @param {string} [options.rating='reliable'] - Free rating label (e.g. 'reliable')
   * @param {string} [options.since] - When the working relationship began (e.g. '2026-01')
   * @param {string} [options.volume] - 'low' | 'medium' | 'high'
   * @param {string} [options.note] - Human-readable note
   * @param {string} [options.id] - Override the replaceable 'd' tag
   * @returns {Object} Signed Nostr event
   */
  buildVouchEvent(pubkey, options = {}) {
    if (!pubkey || typeof pubkey !== 'string') {
      throw new Error('pubkey (the provider being vouched for) is required');
    }
    if (pubkey === this.publicKey) {
      throw new Error('A provider cannot attest to itself');
    }

    // Replaceable key: one standing attestation per (attester, target) pair.
    const d = options.id || `vouch-${pubkey.substring(0, 16)}`;

    const tags = [
      ['d', d],
      ['p', pubkey],
      ['rating', options.rating || 'reliable']
    ];

    if (options.since) tags.push(['since', String(options.since)]);
    if (options.volume) tags.push(['volume', String(options.volume)]);
    if (options.note) tags.push(['note', String(options.note)]);

    return finalizeEvent({
      kind: KINDS.ATTESTATION,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: ''
    }, this.secretKeyBytes);
  }

  /**
   * Build a signed revocation event (kind 38385).
   * @param {string} pubkey - The provider whose trust is being withdrawn (hex pubkey)
   * @param {string} reason - Why trust is being withdrawn
   * @param {Object} [options]
   * @param {string} [options.action='revoked'] - Action label
   * @param {string} [options.effective] - Effective date (e.g. '2026-09-15')
   * @param {string} [options.id] - Override the replaceable 'd' tag
   * @returns {Object} Signed Nostr event
   */
  buildRevokeEvent(pubkey, reason, options = {}) {
    if (!pubkey || typeof pubkey !== 'string') {
      throw new Error('pubkey (the provider being revoked) is required');
    }
    if (!reason || typeof reason !== 'string') {
      throw new Error('reason is required for a revocation');
    }

    const d = options.id || `revoke-${pubkey.substring(0, 16)}`;

    const tags = [
      ['d', d],
      ['p', pubkey],
      ['action', options.action || 'revoked'],
      ['reason', reason]
    ];

    if (options.effective) tags.push(['effective', String(options.effective)]);

    return finalizeEvent({
      kind: KINDS.REVOCATION,
      created_at: Math.floor(Date.now() / 1000),
      tags,
      content: ''
    }, this.secretKeyBytes);
  }

  // ---------------------------------------------------------------------------
  // Publishing
  // ---------------------------------------------------------------------------

  /**
   * Publish a pre-built signed event to all configured relays.
   * @private
   */
  async _publish(event) {
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
   * Vouch for a provider — publishes an attestation (kind 38384).
   * @param {string} pubkey - The provider being vouched for
   * @param {Object} [options] - See buildVouchEvent
   * @returns {Promise<{ success: string[], failed: string[] }>}
   */
  async vouch(pubkey, options = {}) {
    const event = this.buildVouchEvent(pubkey, options);
    return this._publish(event);
  }

  /**
   * Revoke trust from a provider — publishes a revocation (kind 38385).
   * @param {string} pubkey - The provider being revoked
   * @param {string} reason - Why trust is being withdrawn
   * @param {Object} [options] - See buildRevokeEvent
   * @returns {Promise<{ success: string[], failed: string[] }>}
   */
  async revoke(pubkey, reason, options = {}) {
    const event = this.buildRevokeEvent(pubkey, reason, options);
    return this._publish(event);
  }

  // ---------------------------------------------------------------------------
  // Fetching
  // ---------------------------------------------------------------------------

  /**
   * Parse a raw attestation event (kind 38384) into a clean object.
   * @private
   */
  _parseAttestation(event) {
    const tags = {};
    for (const [key, value] of event.tags) {
      if (!(key in tags)) tags[key] = value;
    }
    return {
      attester: event.pubkey,        // who is vouching
      target: tags.p || null,        // who is being vouched for
      rating: tags.rating || null,
      since: tags.since || null,
      volume: tags.volume || null,
      note: tags.note || null,
      eventId: event.id,
      createdAt: event.created_at,
      publishedAt: new Date(event.created_at * 1000)
    };
  }

  /**
   * Parse a raw revocation event (kind 38385) into a clean object.
   * @private
   */
  _parseRevocation(event) {
    const tags = {};
    for (const [key, value] of event.tags) {
      if (!(key in tags)) tags[key] = value;
    }
    return {
      revoker: event.pubkey,         // who is revoking
      target: tags.p || null,        // who is being revoked
      action: tags.action || null,
      reason: tags.reason || null,
      effective: tags.effective || null,
      eventId: event.id,
      createdAt: event.created_at,
      publishedAt: new Date(event.created_at * 1000)
    };
  }

  /**
   * Deduplicate events by attester/revoker, keeping the most recent.
   * (Replaceable events mean a single key has one current attestation per target,
   * but we dedupe defensively so one key can never inflate a score.)
   * @private
   */
  _dedupeByAuthor(parsed, authorField) {
    const byAuthor = new Map();
    for (const item of parsed) {
      const existing = byAuthor.get(item[authorField]);
      if (!existing || item.createdAt > existing.createdAt) {
        byAuthor.set(item[authorField], item);
      }
    }
    return Array.from(byAuthor.values());
  }

  /**
   * Fetch all attestations for a provider.
   *
   * Note: unlike service listings, the 'p' tag is a single-letter tag, so relays
   * DO index it — we can filter server-side here.
   *
   * @param {string} pubkey - The provider to fetch attestations for
   * @returns {Promise<Object[]>} Parsed attestations (deduped per attester)
   */
  async getAttestations(pubkey) {
    const events = await this.pool.querySync(this.relays, {
      kinds: [KINDS.ATTESTATION],
      '#p': [pubkey],
      limit: DEFAULT_QUERY_LIMIT
    });

    const parsed = events
      // Verify signatures explicitly — the attester identity (event.pubkey) is
      // the basis of the trust score, so it must be cryptographically authentic.
      .filter(e => { try { return verifyEvent(e); } catch { return false; } })
      .map(e => {
        try { return this._parseAttestation(e); } catch { return null; }
      })
      .filter(a => a && a.target === pubkey && a.attester !== pubkey); // ignore self-vouch

    return this._dedupeByAuthor(parsed, 'attester');
  }

  /**
   * Fetch all active revocations for a provider.
   * @param {string} pubkey - The provider to fetch revocations for
   * @returns {Promise<Object[]>} Parsed revocations (deduped per revoker)
   */
  async getRevocations(pubkey) {
    const events = await this.pool.querySync(this.relays, {
      kinds: [KINDS.REVOCATION],
      '#p': [pubkey],
      limit: DEFAULT_QUERY_LIMIT
    });

    const parsed = events
      // Verify signatures explicitly — a forged revocation must never count.
      .filter(e => { try { return verifyEvent(e); } catch { return false; } })
      .map(e => {
        try { return this._parseRevocation(e); } catch { return null; }
      })
      .filter(r => r && r.target === pubkey && r.action === 'revoked');

    return this._dedupeByAuthor(parsed, 'revoker');
  }

  // ---------------------------------------------------------------------------
  // Trust scoring
  // ---------------------------------------------------------------------------

  /**
   * Classify an author key into a trust tier.
   * @private
   */
  _tierOf(authorPubkey, knownSet, alliancePubkey) {
    if (alliancePubkey && authorPubkey === alliancePubkey) return 'ALLIANCE';
    if (knownSet.has(authorPubkey)) return 'PROVIDER';
    return 'UNKNOWN';
  }

  /**
   * Calculate a provider's trust score.
   *
   * Score = sum of attestation weights (by tier) + revocation penalties.
   *   - Alliance attestation:            +3  (TRUST_WEIGHTS.ALLIANCE)
   *   - Recognised provider attestation: +1  (TRUST_WEIGHTS.PROVIDER)
   *   - Unknown-key attestation:          0  (TRUST_WEIGHTS.UNKNOWN — sybil resistance)
   *   - Active revocation (recognised):  -10 (TRUST_WEIGHTS.REVOCATION)
   *
   * Only recognised keys (alliance or known providers) can move the score, in
   * either direction. Unknown keys carry no weight.
   *
   * @param {string} pubkey - The provider to score
   * @param {Object} [options]
   * @param {string[]} [options.knownProviders=[]] - Recognised provider pubkeys
   * @param {string} [options.alliancePubkey] - The alliance anchor pubkey
   * @param {Object[]} [options.attestations] - Pre-fetched attestations (skips network)
   * @param {Object[]} [options.revocations] - Pre-fetched revocations (skips network)
   * @returns {Promise<Object>} { pubkey, score, attestationCount, revocationCount, breakdown }
   */
  async score(pubkey, options = {}) {
    const knownSet = new Set(options.knownProviders || []);
    const alliancePubkey = options.alliancePubkey || null;

    const attestations = options.attestations || await this.getAttestations(pubkey);
    const revocations = options.revocations || await this.getRevocations(pubkey);

    const breakdown = { ALLIANCE: 0, PROVIDER: 0, UNKNOWN: 0, REVOCATION: 0 };
    let score = 0;

    for (const a of attestations) {
      const tier = this._tierOf(a.attester, knownSet, alliancePubkey);
      breakdown[tier] += 1;
      score += TRUST_WEIGHTS[tier];
    }

    // Revocations only count from recognised keys (alliance or known providers).
    for (const r of revocations) {
      const tier = this._tierOf(r.revoker, knownSet, alliancePubkey);
      if (tier === 'ALLIANCE' || tier === 'PROVIDER') {
        breakdown.REVOCATION += 1;
        score += TRUST_WEIGHTS.REVOCATION;
      }
    }

    return {
      pubkey,
      score,
      attestationCount: attestations.length,
      revocationCount: breakdown.REVOCATION,
      breakdown
    };
  }

  /**
   * Close all relay connections.
   */
  close() {
    this.pool.close(this.relays);
  }
}

module.exports = { Attestation };
