# PRD — CrimeLink Prototype

## Problem (SIH 26189)
NCRB / Women Safety Division: investigators can't see hidden relationships across
FIRs, CDRs, financial records, and intelligence reports because the data is
fragmented across systems. Manual cross-referencing is slow and misses links.

## What this prototype proves (one function, end to end)
**Input:** a new FIR narrative (free text).
**Output:** extracted entities (persons, locations, phones, vehicles) plotted
into a network graph against prior cases, with:
- hidden connections surfaced (shared phone/vehicle/location linking the new
  case to an existing cluster the investigator didn't know about)
- key-connector ranking (PageRank + betweenness centrality) — who's the hub
- a real NCRB district-wise crime-stats panel (hotspot view) for the tabular
  filtering half of the architecture

This is Use Case 2 ("new FIR investigation leads") from the architecture doc,
built as a thin vertical slice — not the full three-store platform.

## Non-goals for this prototype
- No Postgres/Neo4j/Qdrant/Kafka/MinIO — those are the target production
  architecture (see `crimelink-architecture-design.md`), out of scope for a
  2-hour build.
- No OCR pipeline — text input only.
- No real per-case FIR narrative dataset — individual FIR text with names/
  phones is restricted CCTNS data, not publicly obtainable. Narrative demo
  data is clearly labeled illustrative sample text in the UI.
- No auth/multi-user/persistence — single-session in-memory demo.

## Users
Investigators / analysts at state police or NCRB reviewing a new FIR and
wanting to know: does this connect to anything we already have on file?

## Success criteria for the demo
1. Judge pastes or loads a sample FIR with no obvious names.
2. System extracts entities and shows a network graph.
3. A shared identifier (phone/vehicle) visibly links the new case into an
   existing gang cluster — the "hidden connection" moment.
4. Key-connector list shows who the influential node is, backed by a real
   graph algorithm (not a canned label).
5. Hotspot tab shows real NCRB numbers, not synthetic data.
6. UI is usable in at least English + Hindi (SIH judges expect Indian-language
   accessibility for a NCRB/MHA system).
