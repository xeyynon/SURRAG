# ARCHITECTURE — CrimeLink Prototype

Full target architecture (three-store: Postgres + Neo4j + Qdrant) is in
`crimelink-architecture-design.md`; the layered service view is in
`Criminal_Intelligence_Architecture_FINAL.png`; the investigator UX journey
is in `Criminal_Intelligence_App_Flow.png`. This document describes what's
actually built — the real three-store data layer plus most of the App
Flow diagram's investigator journey (login, search, profiles, timeline,
case registry, evidence upload, reports) — not a single-process stand-in for
it (see [DECISIONS.md](DECISIONS.md) for why each switch happened and what's
still simplified).

## System diagram (as built)

```
┌─────────────────────────┐        ┌──────────────────────────────┐
│  React + Vite frontend  │  HTTP  │   FastAPI backend             │
│  (localhost:5173)       │◄──────►│   (localhost:8000)            │
│                          │  /api  │                                │
│  - App.jsx (tabs, login) │        │  - main.py (routes + ingest)   │
│  - LoginScreen.jsx       │        │  - extraction.py (NER)         │
│  - SearchPanel.jsx       │        │  - entity_resolution.py        │
│  - PersonProfile.jsx     │        │  - pg.py / neo.py / vectors.py │
│  - TimelinePanel.jsx     │        │  - hotspot.py (real CSV data)  │
│  - HotspotPanel.jsx +    │        │  - auth.py (API-key stub)      │
│    HotspotMap.jsx        │        │  - report.py (LLM synthesis)   │
│  - CasesPanel.jsx        │        │                                │
│  - CatalogBar.jsx        │        │                                │
│  - i18n.js (5 languages) │        │                                │
│  - react-force-graph-2d  │        │                                │
└─────────────────────────┘        └───────────────┬────────────────┘
                                                     │
                        ┌────────────────────────────┼────────────────────────────┐
                        │                            │                            │
              ┌─────────▼─────────┐        ┌─────────▼─────────┐        ┌─────────▼─────────┐
              │ PostgreSQL          │        │ Neo4j 5 + GDS       │        │ Qdrant              │
              │ (tabular store)     │        │ (graph store)       │        │ (vector store)      │
              │ person / cases /    │        │ Person/Case/Location│        │ fir_narratives       │
              │ person_case_link    │        │ /Phone/Vehicle nodes│        │ collection, 384-dim  │
              │ :5432                │        │ CO_OCCURS edges     │        │ MiniLM embeddings    │
              │                      │        │ :7687 (bolt)         │        │ :6333                │
              └──────────────────────┘        └──────────────────────┘        └──────────────────────┘
                        all three run via `docker-compose up` (docker-compose.yml)

Extraction still uses:
              ┌─────────────────────┐          ┌───────────────────────┐
              │ Groq API (optional)  │          │ spaCy + regex          │
              │ llama-3.3-70b        │          │ (offline fallback,     │
              │ if GROQ_API_KEY set  │          │ always available)      │
              └───────────────────────┘          └───────────────────────┘
```

## Mapping to `Criminal_Intelligence_Architecture_FINAL.png`

| Diagram box | Status here |
|---|---|
| Investigator & Presentation Layer | Built — React dashboard (Network/Hotspots/Cases tabs), no map/timeline view yet |
| Evidence & Data Ingestion | **Not built** — text input only, no file/CCTV/OSINT ingestion or validation pipeline |
| Application & API Layer — API Gateway | **Not built** — FastAPI called directly, no gateway/rate limiting |
| Application & API Layer — Case Management Service | Built (thin) — `GET /api/cases`, `GET /api/cases/{cid}` |
| Application & API Layer — Auth & Access Service | Built (stub) — single shared API key via `auth.py`, no roles/users/audit trail |
| Intelligence & Processing — Data Processing Service | Built — `neo.py` does link analysis (PageRank/betweenness via real GDS) + `entity_resolution.py` does fuzzy person matching. Still no timeline generation or geospatial joins. |
| Intelligence & Processing — AI/ML Service | Built (partial) — `extraction.py` (NLP entity extraction) + `vectors.py` (semantic similarity search). No risk scoring or anomaly detection. |
| Data Platform — Raw Evidence Object Storage | **Not built** |
| Data Platform — Crime Data Lakehouse | **Built** — real Postgres (`person`/`cases`/`person_case_link`) |
| Data Platform — Metadata & Geospatial DB | **Partially built** — Neo4j holds the graph/metadata; `hotspot.py` still reads the NCRB CSV directly, no geospatial indexing |

## Mapping to `crimelink-architecture-design.md` (the three-store design)

| Design element | Status here |
|---|---|
| PostgreSQL tabular store (`person`, `case`, `person_case_link`) | **Built** in `pg.py` — same three tables, simplified (no salted id_hash, no denormalized master-index columns) |
| Neo4j graph store | **Built** in `neo.py` — `Person`/`Case`/`Location`/`Phone`/`Vehicle` nodes, real GDS PageRank/betweenness. Edge model simplified to one generic `CO_OCCURS` relationship instead of typed edges (`ACCUSED_IN`, `USES`, `CO_ACCUSED_WITH`, etc.) |
| Qdrant vector store | **Built** in `vectors.py` — `fir_narratives` collection, one embedding per case, semantic similarity search. No separate `mo_pattern` collection (MO-snippet extraction not implemented) |
| PID/CID identity scheme | **Partially built** — persons get a real persistent `PID` via entity resolution (see below); format simplified to `PID-<8hex>`/`CID-<8hex>`, not the district-coded `{PID\|CID}-{state}{district}-{random:8}` scheme |
| Entity resolution | **Built** — `entity_resolution.py` fuzzy-matches (rapidfuzz `token_set_ratio`, threshold 88) new person names against existing `person.canonical_name`/`aliases`; no DOB/address matching (not extracted), no exact ID-hash matching |
| Embedding model | `all-MiniLM-L6-v2` (English-only) instead of `multilingual-e5-large`/IndicSBERT — a deliberate time-budget trade-off, see DECISIONS.md |
| Ingestion pipeline (OCR → NER → resolution → Kafka fan-out → reconciliation) | **Not built** — `main.ingest_case()` does NER → resolution → synchronous writes to all three stores directly. No OCR, no queue, no reconciliation job (writes are synchronous so there's nothing to reconcile at this scale) |
| Use Case 1 (hotspot pattern summary, LLM-synthesized) | **Not built** — Hotspots tab is real NCRB aggregate stats, not wired to the graph/vector data, no LLM report synthesis |
| Use Case 2 (new FIR → leads, graph + vector in parallel) | **Built** — `POST /api/analyze` runs graph neighbor lookup (`neo.neighbors_of_entity`) and vector similarity search (`vectors.search_similar`) as two independent calls, both surfaced in the response. No LLM-synthesized lead document — raw graph + ranked list only |

## Why this stack

| Decision | Why |
|---|---|
| Real Postgres + Neo4j + Qdrant via Docker Compose | User asked to switch from the SQLite/networkx stand-in to the actual target architecture. Docker Compose is the fastest reliable path to three real databases on Windows without native-install pain — see [DECISIONS.md](DECISIONS.md). |
| Fuzzy name resolution (rapidfuzz `token_set_ratio`) instead of exact string match | This was the prototype's biggest correctness gap — "Bhau" and "Bhau Deshmukh" used to form separate-but-linked nodes instead of merging into one person. `token_set_ratio` handles subset/nickname matches well (a name that's a subset of another's tokens scores highly). |
| `all-MiniLM-L6-v2` instead of a multilingual embedding model | ~90MB vs. multi-GB for `multilingual-e5-large`; fast enough to download and run inside the session's time budget. English-only is a real limitation given FIRs are routinely filed in regional languages — documented as a known gap, not silently accepted. |
| One generic `CO_OCCURS` edge type instead of typed edges | Preserves the exact co-occurrence semantics the prototype already validated (pairwise edges between every entity in a case) while moving storage into Neo4j; typed edges (`ACCUSED_IN`, `USES`, etc.) would need per-entity *roles*, which the current extraction pipeline doesn't produce. |
| Groq-first, spaCy-fallback extraction (unchanged) | Still the zero-cost, zero-internet-dependency default — this decision wasn't revisited in this pass. |
| Real NCRB CSV for hotspots, synthetic text for narratives (unchanged) | Still applies — see prior DECISIONS.md entry. |

## Request flow — `POST /api/analyze` (the core function)

```
POST /api/analyze { narrative, fir_number, crime_type }
  │  requires header X-API-Key: <CRIMELINK_API_KEY>   [auth.py, 401 if missing/wrong]
  ▼
main.ingest_case(cid, fir_number, crime_type, narrative)
  │
  ├─► extract_entities(narrative)              [extraction.py — Groq or spaCy+regex]
  │     { persons, locations, phones, vehicles }
  │
  ├─► resolve_case_persons(persons, phones, vehicles)   [entity_resolution.py]
  │     for each name: fuzzy-match against pg.list_persons() → existing PID, or mint a new one
  │     → [{pid, name, is_new}]
  │
  ├─► pg.insert_case(...) + pg.link_person_case(pid, cid) for each resolved person   [pg.py]
  │
  ├─► neo.write_case(cid, ..., resolved_persons, locations, phones, vehicles)   [neo.py]
  │     MERGE Case/Person/Location/Phone/Vehicle nodes, pairwise CO_OCCURS edges
  │
  └─► vectors.upsert_narrative(cid, narrative, ...)   [vectors.py]
        embed with MiniLM, upsert into Qdrant

  ▼ (back in the route handler)
neo.neighbors_of_entity(kind, value) for every new entity → hidden_connections
  │  (graph-path lookup, independent of the vector path below)
  ▼
vectors.search_similar(narrative, exclude_cid=cid) → similar_cases
  │  (vector-path lookup, runs independently — Use Case 2's parallel design)
  ▼
neo.analyze() → real GDS PageRank + betweenness → key_connectors
  ▼
neo.to_frontend_graph(highlight=new_ids) → { nodes, edges } (Cytoscape shape)
  ▼
JSON response → React renders with react-force-graph-2d
```

## Frontend structure

- `App.jsx` — top-level state (investigator identity, language, active tab,
  FIR form, analysis result, cross-view navigation), gates everything behind
  `LoginScreen` until an investigator name is set, renders the tab set plus
  the `PersonProfile` overlay.
- `LoginScreen.jsx` — name-only login (see DECISIONS.md — not real auth),
  stored in `localStorage`, threaded through as `X-Investigator-Name`.
- `SearchPanel.jsx` — Smart Search: hits `/api/search`, results deep-link to
  `PersonProfile` or the Case Registry.
- `PersonProfile.jsx` — hits `/api/persons/{pid}`: resolved identity,
  aliases, known phones/vehicles, full case history.
- `TimelinePanel.jsx` — hits `/api/timeline`, chronological (by ingestion
  time) list of all cases, deep-links into the Case Registry.
- `HotspotPanel.jsx` + `HotspotMap.jsx` — real NCRB bar-chart list plus a
  Leaflet state-level map (`stateCentroids.js` — approximate, not surveyed).
- `CasesPanel.jsx` — fetches `/api/cases`, lists persisted cases (seed vs.
  submitted), expandable to show the full narrative; accepts a deep-linked
  `initialExpandedCid`.
- `CatalogBar.jsx` — live counts across all three stores (`/api/catalog`).
- `i18n.js` — `LANGUAGES` array + `STRINGS` dict + `t(key, lang)` helper.
- `seedCases.js` — frontend mirror of `backend/seed_data.py`'s sample cases,
  used to populate the "load sample FIR" dropdown.

## Additional backend endpoints (this round)

- `GET /api/persons/{pid}` — full person profile + case history (`pg.py`).
- `GET /api/search?q=` — combined Postgres (`persons`, `cases`) + Neo4j
  (`locations`/`phones`/`vehicles`) search.
- `GET /api/timeline?pid=` — cases ordered by ingestion time, optionally
  scoped to one person.
- `GET /api/catalog` — live counts from Postgres, Neo4j, and Qdrant.
- `POST /api/upload` — multipart `.txt` file → same `ingest_case()` pipeline
  as `/api/analyze`; images/PDFs are explicitly rejected (no OCR — see
  DECISIONS.md), not silently mishandled.
- `GET /api/hotspots/by_state?crime_type=` — NCRB district data aggregated
  to state level, for the map view.
- `report.synthesize_report(...)` is called inside both `/api/analyze` and
  `/api/upload`'s response building (`main.build_analysis_response()`), not
  exposed as its own route — it always runs alongside the existing pipeline.

See [FLOW.md](FLOW.md) for the precise call graph and entry points.
