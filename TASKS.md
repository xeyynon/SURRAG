# TASKS.md

## Done (this session)

**Core pipeline**
- [x] FastAPI backend: entity extraction (Groq + spaCy/regex fallback)
- [x] `POST /api/analyze` — new FIR → entities → hidden connections + key connectors
- [x] React + Vite + Tailwind frontend, dark dashboard UI
- [x] react-force-graph-2d network visualization with highlighted new entities
- [x] Real NCRB district-wise crime data integrated (`/api/hotspots`)
- [x] Multi-language UI: English, Hindi, Marathi, Tamil, Bengali
- [x] Case Management endpoints + Case Registry UI tab
- [x] API-key auth stub (`auth.py`) gating `POST /api/analyze`

**Real three-store migration**
- [x] PostgreSQL (tabular, `pg.py`), Neo4j + GDS (graph, `neo.py`), Qdrant
  (vector, `vectors.py`), all via `docker-compose.yml`
- [x] Entity resolution (`entity_resolution.py`) — fuzzy name matching
  (rapidfuzz), persons get a persistent PID instead of exact-string matching
- [x] Vector similarity search — `all-MiniLM-L6-v2` embeddings, "Similar MO
  Cases" panel, independent of the graph path (Use Case 2's parallel design)
- [x] Real GDS PageRank + betweenness centrality for key-connector ranking

**App Flow coverage (round 1)**
- [x] Investigator Login (name-only, localStorage-gated, threads through as
  `X-Investigator-Name` for case attribution — not real auth, see below)
- [x] Smart Search (`/api/search`, `SearchPanel.jsx`)
- [x] Person & Entity Profiling (`/api/persons/{pid}`, `PersonProfile.jsx`)
- [x] Case Linking & Timeline (`/api/timeline`, `TimelinePanel.jsx`)
- [x] Evidence upload (`POST /api/upload`)
- [x] Data Catalog strip (`/api/catalog`, `CatalogBar.jsx`)
- [x] Hotspot state map (`HotspotMap.jsx`, Leaflet + approximate centroids)
- [x] LLM-synthesized investigation-lead report (`report.py`) — Groq-first,
  templated fallback, every claim cited to a CID/PID
- [x] District-coded PID/CID format (best-effort, location-slug based)
- [x] Click-through navigation: graph nodes / hidden connections / similar
  cases / search results all deep-link to person profiles or case detail

**App Flow coverage (round 2)**
- [x] Real occurrence-date extraction (`extraction.py`'s `parse_occurrence_
  date` — spaCy DATE entities + dateutil, bounded 1990–2035, vague-word
  filtered) — plus wiring `seed_data.py`'s existing `date` field through to
  Postgres, which had never actually been connected. Timeline now shows
  real occurrence dates when extractable, ingestion time otherwise, clearly
  labeled which is which.
- [x] Evidence upload broadened: `.pdf/.docx/.doc/.pptx/.xlsx/.xls/.html/
  .csv/.json/.xml/.png/.jpg/.jpeg` via `markitdown` (`documents.py`), plus
  Groq vision-model OCR fallback for images with no text layer. Scanned
  (image-only) PDFs/Word docs are still not OCR'd — see gaps below.
- [x] Data Catalog upgraded to real schema introspection (`/api/catalog/
  schema` — live Postgres `information_schema`, Neo4j `db.labels()`/
  `db.relationshipTypes()`, Qdrant collection config), not hardcoded text.
  Expandable from the `CatalogBar`.
- [x] Case Workspace (`/api/cases/{cid}/workspace`, `CaseWorkspace.jsx`) —
  narrative, resolved persons, a case-centered local subgraph, similar
  cases, and a freshly-synthesized lead report, all in one view. Replaces
  "just expand in the flat Case Registry" as the primary way to open a case.
- [x] Frontend motion polish (Framer Motion): login entrance animation,
  view-crossfade on navigation, analyze-results fade-in.

## Not done / known gaps

**Data**
- [ ] No real per-case FIR narrative dataset (none is publicly available —
  see DECISIONS.md).
- [ ] NCRB CSV is 2014 data only.

**Extraction & resolution quality**
- [ ] Gazetteer-based location/vehicle correction only covers this demo's
  seed dataset.
- [ ] Entity resolution is name-only (rapidfuzz threshold 88) — no DOB/
  address/exact-ID-hash signals, no manual investigator override.
- [ ] Embedding model (`all-MiniLM-L6-v2`) and spaCy NER are both
  English-only — a real regression against the design doc's multilingual
  requirement, kept to fit the time budget (see DECISIONS.md).
- [ ] Occurrence-date extraction only fires when a date is explicitly
  stated in text — no inference from relative phrases ("last Tuesday").

**Graph model**
- [ ] Neo4j edges are one generic `CO_OCCURS` relationship, not the design
  doc's typed edges — extraction doesn't produce per-person roles/contacts.
- [ ] GDS projection is dropped and rebuilt on every `/api/analyze` call.

**Architecture / infrastructure (deferred, not attempted — see DECISIONS.md
for why each needs more than a rushed pass)**
- [ ] OCR only covers standalone image files (via Groq vision) — scanned
  (image-only) PDFs and Word docs are not OCR'd; markitdown doesn't expose
  page images from those formats for the vision fallback to run on.
- [ ] No Kafka/RabbitMQ fan-out or nightly reconciliation job — writes to
  the three stores are synchronous in one request.
- [ ] No MinIO / Raw Evidence Object Storage — uploaded files are processed
  in memory and not persisted as raw artifacts, only their extracted text.
- [ ] No API Gateway (rate limiting, routing) — FastAPI is called directly.
- [ ] No real geospatial database — the hotspot map uses a hardcoded
  ~36-entry state-centroid lookup, not PostGIS or surveyed geodata.
- [ ] Auth is name-only + one shared demo API key — no passwords, no
  session tokens, no roles/permissions, no audit trail. Real deployment
  needs the diagram's full Auth & Access Service (chain-of-custody matters
  for legal admissibility).
- [ ] Use Case 1 (hotspot pattern summary) isn't wired end-to-end — the
  Hotspots tab/map is real NCRB aggregate stats, not connected to the
  graph/vector pipeline or LLM-synthesized.
- [ ] Error monitoring (Sentry) and hosted deployment (Vercel/Supabase)
  were researched and explicitly deferred — no account/DSN required to run
  this prototype; revisit if/when it needs to leave localhost.

**UI**
- [ ] i18n covers UI chrome only, not dynamically extracted entity labels,
  narrative text, or LLM report output.
- [ ] No mobile/responsive layout pass — built and tested at 1440×900/1000.
- [ ] Motion polish is narrow (login, navigation, results panel) — no full
  typography/color-system redesign; noted as a deliberate, separate future
  pass, not folded into functional work.

## Suggested next steps, in priority order
1. Real auth: passwords/session tokens, roles, audit trail — required before
   any real deployment, not just a nice-to-have.
2. Wire Use Case 1 (hotspot summary) into the graph/vector pipeline with
   LLM synthesis, matching what Use Case 2 (`/api/analyze`) already does.
3. Typed graph edges once extraction can attribute roles/contacts per person.
4. Multilingual embedding + NER model swap once the time/infra budget allows.
5. OCR for scanned PDFs/Word docs (page-image extraction + vision OCR).
6. Kafka fan-out + reconciliation, MinIO, real geospatial DB, API Gateway —
   the remaining production-infrastructure gaps.
