# FLOW.md

## Entry points

| Process | Command | Entry file |
|---|---|---|
| Backend | `uvicorn main:app --port 8000` | `backend/main.py` |
| Frontend | `npm run dev` (Vite) | `frontend/index.html` → `frontend/src/main.jsx` → `frontend/src/App.jsx` |

## Backend startup sequence (`main.py`, `@app.on_event("startup")`)

```
main.py imports:
  pg    — Postgres (person / cases / person_case_link)
  neo   — Neo4j (graph writes + GDS reads)
  vectors — Qdrant (embeddings + similarity search)
  seed_data.SEED_CASES              — 4 hardcoded sample FIRs
  extraction.extract_entities       — NER function
  entity_resolution.resolve_case_persons  — fuzzy person resolution
  hotspot.list_states / list_districts / get_hotspots / CRIME_COLUMNS
  auth.require_api_key

on_startup() — runs once when uvicorn boots, requires all 3 Docker containers up:
  pg.init_db()          — creates person/cases/person_case_link tables if absent
  neo.init_constraints() — creates uniqueness constraints on pid/cid/name/number/reg
  vectors.ensure_collection() — creates the fir_narratives Qdrant collection if absent
  if pg.seed_count() == 0:
      for case in SEED_CASES: main.ingest_case(..., is_seed=True)
      — idempotent ONLY if the previous attempt fully completed; see AGENTS.md
        for the wipe-and-restart recovery steps if a previous run crashed mid-seed
```
First boot is slow: `vectors.get_model()` downloads `all-MiniLM-L6-v2` (~90MB)
on first use, then all 4 seed cases run through the full
extract → resolve → write-to-3-stores pipeline before the server accepts
requests.

## Request flow: `POST /api/analyze` (the core demo function)

```
main.analyze_new_fir(req, _auth=Depends(require_api_key))
  │  auth.require_api_key checks X-API-Key header first — 401 if wrong/missing
  │
  ├─► pg.new_id("CID")   generates CID-<8 hex chars>
  │
  ├─► main.ingest_case(cid, fir_number, crime_type, narrative)
  │     │
  │     ├─► extraction.extract_entities(narrative)
  │     │     ├─► extraction.extract_with_groq(text)   [tries first, if GROQ_API_KEY set]
  │     │     └─► extraction.extract_with_spacy(text)   [fallback, always available]
  │     │           via extraction.get_nlp(), extraction.extract_regex_entities(),
  │     │           extraction.clean_person_name() for each candidate name
  │     │     → { persons, locations, phones, vehicles, source }
  │     │
  │     ├─► entity_resolution.resolve_case_persons(persons, phones, vehicles)
  │     │     for each name: entity_resolution.resolve_person(name)
  │     │       → pg.list_persons(), fuzzy-match via rapidfuzz.fuzz.token_set_ratio
  │     │       → match ≥88: reuse existing pid | else: pg.create_person(name)
  │     │     pg.add_alias_and_contacts(pid, name, phones, vehicles) for each
  │     │     → [{pid, name, is_new}]
  │     │
  │     ├─► pg.insert_case(...) + pg.link_person_case(pid, cid) per resolved person
  │     │
  │     ├─► neo.write_case(cid, ..., resolved_persons, locations, phones, vehicles)
  │     │     MERGE Case/Person/Location/Phone/Vehicle nodes
  │     │     pairwise MERGE ... CO_OCCURS edges between every entity pair in this case
  │     │
  │     └─► vectors.upsert_narrative(cid, narrative, fir_number, crime_type)
  │           vectors.get_model().encode(narrative) → Qdrant upsert
  │
  ├─► neo.neighbors_of_entity(kind, value) for every newly-resolved entity
  │     → diff against the new entity set → hidden_connections
  │
  ├─► vectors.search_similar(narrative, top_k=5, exclude_cid=cid)
  │     → similar_cases (runs independently of the graph lookup above —
  │       Use Case 2's parallel-path design from crimelink-architecture-design.md)
  │
  ├─► neo.analyze()
  │     drops + re-projects a GDS graph, runs gds.pageRank.stream +
  │     gds.betweenness.stream → key_connectors
  │
  └─► neo.to_frontend_graph(highlight_ids=new_ids)
        queries all nodes/relationships → { nodes: [...], edges: [...] }
        (Cytoscape shape, consumed directly by react-force-graph-2d's graphData prop)

Response JSON → frontend App.jsx.runAnalysis()
```

## Other endpoints

- `GET /api/seed` → raw `SEED_CASES` (unused by current UI, available for debugging).
- `GET /api/graph` → same graph/insights pipeline as `/api/analyze`'s tail end,
  read-only — no case insertion. No auth required.
- `GET /api/cases` → `pg.list_cases()`, newest first. Feeds the Case Registry tab.
- `GET /api/cases/{cid}` → `pg.get_case(cid)`, single case detail.
- `GET /api/hotspots?state=&crime_type=&top_n=` → `hotspot.get_hotspots()` reads
  `data/ncrb_crime_data.csv` fresh into memory on first call (`hotspot._rows`
  cached module-level after that), filters `District == "Total"` rows, sorts
  by the requested crime column, returns top N. Unrelated to the 3-store
  migration — still flat-file, by design (see ARCHITECTURE.md).
- `GET /api/health` → liveness check, used by `curl` during dev, not by the UI.

## Frontend execution order

```
main.jsx renders <App/>
  │
App.jsx (mount)
  ├─► useState: lang='en', tab='network', narrative/firNumber/crimeType
  │     (defaulted to SEED_CASES[last] — the "new robbery FIR" demo case
  │      designed to reveal a hidden connection on first click)
  ├─► useEffect: ResizeObserver on containerRef → sets `dims` for the graph canvas
  │
  user clicks "Extract & Analyze Network"
  │
  ├─► runAnalysis()
  │     └─► fetch POST /api/analyze, header X-API-Key: demo-investigator-key
  │           (see backend flow above — this call also persists the case to all 3 stores)
  │           └─► setResult(data); setCasesVersion(v => v+1)   [triggers Cases tab refetch]
  │
  ├─► result.resolved_persons rendered as the Entity Resolution list (name → PID, new/matched badge)
  ├─► result.similar_cases rendered as the Similar MO Cases panel (Qdrant scores, ranked)
  │
  ├─► graphData derived from result.graph.{nodes,edges} on every render
  ├─► <ForceGraph2D graphData=... nodeColor=... nodeCanvasObject=... />
  │     └─► onEngineStop → graphRef.zoomToFit()   [initial fit after physics settles]
  │
  user clicks tab "Crime Hotspots (Real NCRB Data)"
  │
  ├─► tab='hotspots' → renders <HotspotPanel lang=.../>
  │     └─► HotspotPanel useEffect (mount) → fetch GET /api/hotspots (default: Murder, all states)
  │     └─► HotspotPanel useEffect ([state, crimeType]) → refetch on filter change
  │
  user clicks tab "Case Registry"
  │
  └─► tab='cases' → renders <CasesPanel lang=... refreshKey={casesVersion}/>
        └─► useEffect([refreshKey]) → fetch GET /api/cases → list, click a row to expand narrative
```

Tab switching back to 'network' re-triggers the `zoomToFit` effect (keyed on
`[tab, result, dims.width, dims.height]`) so the graph re-fits the canvas —
see DECISIONS.md for why this effect exists.

## What AI changed this session

Everything in this repo was created by the AI agent in this session — there
was no pre-existing code. In build order:

1. `backend/requirements.txt`, `backend/seed_data.py` — synthetic case data
2. `backend/extraction.py` — NER (Groq + spaCy/regex), later patched twice:
   gazetteer for mislabeled locations/vehicles, `clean_person_name()` for
   title/possessive stripping
3. `backend/graph.py` — networkx graph build + analysis
4. `backend/main.py` — FastAPI routes; later extended with `/api/hotspots`
5. Backend dependency fixes: `numpy<2.0` / `scipy<1.12` pins (ABI conflict
   with spaCy's compiled `thinc` extension — see DECISIONS.md)
6. `frontend/` scaffolded via `npm create vite@latest . -- --template react`,
   then Tailwind v4 + `react-force-graph-2d` added
7. `frontend/src/index.css`, `frontend/vite.config.js` — dark theme + API proxy
8. `frontend/src/App.jsx`, `frontend/src/seedCases.js` — initial single-view UI
9. `backend/data/ncrb_crime_data.csv` downloaded (real NCRB data), plus
   `backend/hotspot.py` — later patched to filter `District == "Total"` rows
10. `frontend/src/HotspotPanel.jsx`, `frontend/src/i18n.js` — hotspot tab +
    5-language support; `App.jsx` rewritten to add tabs + language switcher
11. `frontend/test-app.cjs` — Playwright QA script; used to catch and verify
    fixes for the "Total" district bug and the tab-switch graph-resize bug
12. `PRD.md`, `ARCHITECTURE.md`, `AGENTS.md`, `DECISIONS.md`, `TASKS.md`,
    `FLOW.md` (this file) — documentation set, written after the working
    prototype was verified end-to-end.
13. User shared `Criminal_Intelligence_Architecture_FINAL.png` (the target
    5-layer architecture) and asked to implement it. Given the remaining time
    budget, the user chose to prioritize persistence + case management (see
    DECISIONS.md) over ingestion/gateway/object-storage/geospatial-DB:
    - `backend/db.py` — SQLite persistence, standing in for the Crime Data
      Lakehouse / Metadata DB
    - `backend/auth.py` — single-API-key stub, standing in for Auth & Access
    - `main.py` rewritten: `/api/analyze` now persists via `db.insert_case`
      and builds the graph from `db.all_cases_with_entities()` instead of a
      hardcoded seed list + one request-scoped case; added `GET /api/cases`
      and `GET /api/cases/{cid}` (Case Management)
    - `frontend/src/CasesPanel.jsx` — new Case Registry tab; `App.jsx` wired
      with the `X-API-Key` header and a `casesVersion` refetch trigger;
      `i18n.js` extended with the new tab's strings
    - Re-verified via `test-app.cjs`: submitted the same demo FIR twice,
      confirmed both persist as distinct rows in the Case Registry and both
      remain part of the network graph on the next analysis
14. User compared the prototype against both target architecture documents
    directly and asked to "switch to the actual architecture, and with
    improvements." Scoped via two questions: Docker Desktop as the path to
    real databases, and "entity resolution + vector similarity" as the
    priority improvement (over a thin-everywhere stub or full LLM-report
    synthesis). Delivered:
    - `docker-compose.yml` — postgres:16-alpine, neo4j:5-community (with the
      graph-data-science plugin), qdrant/qdrant
    - `backend/pg.py` — replaces `db.py` (deleted): real `person`/`cases`/
      `person_case_link` tables
    - `backend/neo.py` — replaces `graph.py` (deleted): Neo4j writes +
      real GDS PageRank/betweenness via a drop-and-reproject-per-call graph
    - `backend/vectors.py` — new: Qdrant + `all-MiniLM-L6-v2` embeddings,
      per-case narrative similarity search
    - `backend/entity_resolution.py` — new: rapidfuzz fuzzy person-name
      matching against Postgres, so name variants resolve to one PID
    - `main.py` rewritten around `ingest_case()`, orchestrating all three
      stores per request; `/api/analyze` response extended with
      `resolved_persons` and `similar_cases`
    - `frontend/src/App.jsx` — added the Entity Resolution and Similar MO
      Cases panels; `i18n.js` extended
    - Two real bugs found and fixed during this work (both in
      `DECISIONS.md`): a Postgres `array_agg`-over-empty-set `NULL` violation
      in `pg.add_alias_and_contacts`, and a startup race where a stray first
      backend process partially seeded data before Neo4j/Qdrant were fully
      warm, then crashed — masked by a second process truncating the same
      log file. Diagnosed by querying each store directly rather than
      trusting the API or the log.
15. User shared `Criminal_Intelligence_App_Flow.png` (investigator UX
    journey + data ingestion flow) and, after a gap comparison, asked to
    "implement this all." Built everything tractable, deferred
    infrastructure-heavy pieces explicitly (see DECISIONS.md/TASKS.md):
    - `backend/report.py` — LLM-synthesized investigation-lead reports
      (Groq-first, templated fallback), called from
      `main.build_analysis_response()` so both `/api/analyze` and
      `/api/upload` return a `report` field
    - `backend/pg.py` extended: `get_person_profile`, `search`, `timeline`,
      `catalog_stats`, `submitted_by` column, district-slug `new_id()`
    - `backend/neo.py` extended: `search`, `stats`, and `to_frontend_graph`
      now exposes `domain_id` (the real PID/CID/name/number/reg) alongside
      Neo4j's internal `elementId` — needed so frontend node clicks can
      resolve to `/api/persons/{pid}` correctly (caught before it shipped:
      the first version only exposed `elementId`, which isn't a valid PID)
    - `backend/vectors.py` extended: `stats()` for the catalog
    - `main.py` restructured around `build_analysis_response()` (shared by
      analyze and upload) and `ingest_case()` now accepts pre-extracted
      `entities` to avoid double NER/Groq calls; new routes: `/api/persons/
      {pid}`, `/api/search`, `/api/timeline`, `/api/catalog`, `/api/upload`,
      `/api/hotspots/by_state`
    - New frontend: `LoginScreen.jsx`, `SearchPanel.jsx`,
      `PersonProfile.jsx`, `TimelinePanel.jsx`, `CatalogBar.jsx`,
      `HotspotMap.jsx` (Leaflet + `stateCentroids.js`); `App.jsx` rewritten
      around a login gate and cross-view navigation (`openPerson`/
      `openCase` deep-links from graph nodes, hidden connections, similar
      cases, search results, and timeline entries all converge on the same
      two handlers)
    - Bugs caught via `test-app.cjs` + manual curl before calling it done:
      the `domain_id` gap above; a Playwright selector ambiguity
      (`button:has-text("Search")` matched both the "Smart Search" nav tab
      and the actual search submit button); CartoDB's dark basemap tiles
      started requiring an API key mid-session (a literal "API key
      required" watermark appeared on the rendered map) — switched to
      standard OpenStreetMap tiles, which need no key
    - Final state re-verified end-to-end after a clean wipe-and-reseed:
      4 seed cases, all new endpoints, all new UI panels, zero console
      errors across the full click-through in both English and Hindi
