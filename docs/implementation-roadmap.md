# Implementation Roadmap

## Phase 1: Specification (Month 1–2)
- [ ] Finalise data model (this repo)
- [ ] Draft NIP for Nostr community review
- [ ] Circulate among alliance members for feedback
- [ ] Agree on tag vocabulary (standardised values)
- [ ] Assign NIP number

## Phase 2: Reference implementation (Month 3–4)
- [ ] Build reference publisher (Node.js library, npm package)
- [ ] Build reference querier (JS library for wallets)
- [ ] Deploy 3 alliance-operated Nostr relays (different African cities)
- [ ] Each alliance member publishes a test listing
- [ ] Integration tests: publish → query → verify round-trip

## Phase 3: Integration (Month 5–6)
- [ ] Each provider integrates publisher into their backend
- [ ] Each provider deploys /health endpoint
- [ ] Alliance members publish mutual attestations
- [ ] First wallet partner integrates querier
- [ ] First corridor live demo
- [ ] Record and share proof-of-concept video

## Phase 4: Production (Month 7+)
- [ ] Open to all providers
- [ ] Publicise NIP and encourage adoption
- [ ] Additional wallet integrations
- [ ] Build public explorer (web dashboard of active providers)
- [ ] Begin v0.2 standard settlement API implementation
- [ ] Iterate on data model based on real-world usage

## Who builds what

| Component | Owner | Notes |
|-----------|-------|-------|
| NIP specification | Alliance (collaborative) | All members review |
| Reference publisher | 1–2 alliance developers | Open source, npm |
| Reference querier | 1–2 alliance developers | Open source, npm |
| Relay infrastructure | Alliance secretariat | 3 relays, different cities |
| Service listing publisher | Each provider | Uses reference library |
| /health endpoint | Each provider | On existing API |
| Attestation publishing | Each provider | Vouch for known partners |
| Wallet integration | Wallet teams | Uses reference querier |
| Public explorer | Alliance or volunteer | Web dashboard |
