// Type definitions for afri-bitcoin-discovery
// Open protocol for discovering Bitcoin payment services across Africa.

export type Direction = 'off-ramp' | 'on-ramp' | 'both';
export type RailIn = 'lightning' | 'on-chain' | 'ecash' | 'lnurl';
export type RailOut = 'm-pesa' | 'mtn-momo' | 'airtel-money' | 'orange-money' | 'bank' | 'cash';
export type Status = 'active' | 'maintenance' | 'offline';
export type Kyc = 'none' | 'light' | 'full';
export type Speed = 'seconds' | 'minutes' | 'hours';

/** A signed Nostr event. */
export interface NostrEvent {
  id: string;
  pubkey: string;
  created_at: number;
  kind: number;
  tags: string[][];
  content: string;
  sig: string;
}

/** Hex-encoded keypair. */
export interface Keypair {
  privateKey: string;
  publicKey: string;
  secretKeyBytes?: Uint8Array;
}

/** Per-relay publish outcome. */
export interface PublishResult {
  success: string[];
  failed: { relay: string; error: string }[];
  eventId: string;
  pubkey: string;
}

/** Service listing input (config object passed to publish/buildEvent). */
export interface ServiceListing {
  id: string;
  name: string;
  country: string;      // ISO 3166-1 alpha-2
  direction: Direction;
  rail_in: RailIn;
  rail_out: RailOut;
  currency: string;     // ISO 4217
  endpoint: string;     // https URL
  health: string;       // https URL
  status?: Status;
  network?: string;
  min_amount?: string | number;
  max_amount?: string | number;
  fee_range?: string;
  speed?: Speed;
  ttl?: string | number;
  protocols?: string;
  kyc?: Kyc;
  heartbeat?: 'daily' | 'hourly' | 'on-change';
  metadata?: Record<string, unknown>;
}

/** A provider as parsed from a discovered listing. */
export interface Provider {
  pubkey: string;
  eventId: string;
  publishedAt: Date;
  createdAt: number;
  id: string;
  version: string | null;
  name: string;
  country: string;
  direction: Direction;
  rail_in: RailIn;
  rail_out: RailOut;
  currency: string;
  endpoint: string;
  health: string;
  status: Status;
  network: string | null;
  min_amount: string | null;
  max_amount: string | null;
  fee_range: string | null;
  speed: Speed | null;
  ttl: string | null;
  protocols: string[];
  kyc: Kyc | null;
  heartbeat: string | null;
  metadata: Record<string, unknown>;
  healthData?: HealthData;
}

export interface HealthData {
  status: string;
  uptime: string | null;
  speed: number | null;
  capacity: string | null;
  lastTransaction: string | null;
  version: string | null;
  healthy: boolean;
}

export interface QueryFilters {
  country?: string;
  direction?: Direction;
  rail_in?: RailIn;
  rail_out?: RailOut;
  currency?: string;
  freshOnly?: boolean;
  ttl?: number;
  limit?: number;
}

export interface VouchOptions {
  rating?: string;
  since?: string;
  volume?: 'low' | 'medium' | 'high';
  note?: string;
  id?: string;
}

export interface RevokeOptions {
  action?: string;
  effective?: string;
  id?: string;
}

export interface AttestationRecord {
  attester: string;
  target: string | null;
  rating: string | null;
  since: string | null;
  volume: string | null;
  note: string | null;
  eventId: string;
  createdAt: number;
  publishedAt: Date;
}

export interface RevocationRecord {
  revoker: string;
  target: string | null;
  action: string | null;
  reason: string | null;
  effective: string | null;
  eventId: string;
  createdAt: number;
  publishedAt: Date;
}

export interface ScoreOptions {
  knownProviders?: string[];
  alliancePubkey?: string | null;
  attestations?: AttestationRecord[];
  revocations?: RevocationRecord[];
}

export interface ScoreResult {
  pubkey: string;
  score: number;
  attestationCount: number;
  revocationCount: number;
  breakdown: { ALLIANCE: number; PROVIDER: number; UNKNOWN: number; REVOCATION: number };
}

export class Publisher {
  constructor(options: { privateKey: string; relays?: string[] });
  static fromEnv(envVar?: string, relays?: string[]): Publisher;
  publicKey: string;
  relays: string[];
  buildEvent(listing: ServiceListing): NostrEvent;
  publish(listing: ServiceListing): Promise<PublishResult>;
  updateStatus(listing: ServiceListing): Promise<PublishResult>;
  close(): void;
}

export class Querier {
  constructor(options?: { relays?: string[] });
  relays: string[];
  find(filters?: QueryFilters): Promise<Provider[]>;
  findByCountry(country: string): Promise<Provider[]>;
  findOffRamp(country: string, railOut: RailOut): Promise<Provider[]>;
  findOnRamp(country: string): Promise<Provider[]>;
  checkHealth(healthUrl: string, timeout?: number): Promise<HealthData | null>;
  findHealthy(filters?: QueryFilters): Promise<Provider[]>;
  close(): void;
}

export class Attestation {
  constructor(options: { privateKey: string; relays?: string[] });
  static fromEnv(envVar?: string, relays?: string[]): Attestation;
  publicKey: string;
  relays: string[];
  buildVouchEvent(pubkey: string, options?: VouchOptions): NostrEvent;
  buildRevokeEvent(pubkey: string, reason: string, options?: RevokeOptions): NostrEvent;
  vouch(pubkey: string, options?: VouchOptions): Promise<PublishResult>;
  revoke(pubkey: string, reason: string, options?: RevokeOptions): Promise<PublishResult>;
  getAttestations(pubkey: string): Promise<AttestationRecord[]>;
  getRevocations(pubkey: string): Promise<RevocationRecord[]>;
  score(pubkey: string, options?: ScoreOptions): Promise<ScoreResult>;
  close(): void;
}

export function generateKeys(): Keypair;
export function loadKeys(privateKeyHex: string): Keypair;
export function loadKeysFromEnv(envVar?: string): Keypair;

export const KINDS: { SERVICE_LISTING: 38383; ATTESTATION: 38384; REVOCATION: 38385 };
export const DEFAULT_RELAYS: string[];
export const DEFAULT_TTL: number;
export const DEFAULT_QUERY_LIMIT: number;
export const MAX_HEALTH_BYTES: number;
export const HEALTH_CONCURRENCY: number;
export const TRUST_WEIGHTS: { ALLIANCE: number; PROVIDER: number; UNKNOWN: number; REVOCATION: number };
export const PROTOCOL_VERSION: string;
export const FILTER_TAGS: { country: 'c'; direction: 'o'; rail_in: 'i'; rail_out: 'm'; currency: 'f' };
export const ALT_TEXT: Record<number, string>;
export const VOCAB: {
  direction: Direction[];
  rail_in: RailIn[];
  rail_out: RailOut[];
  status: Status[];
  kyc: Kyc[];
  speed: Speed[];
};
