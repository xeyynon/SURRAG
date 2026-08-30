# AGENTS.md

Notes for any AI agent (or human) picking this repo back up.

## Run it

```
# 1. data layer — Postgres + Neo4j + Qdrant
docker compose up -d
# wait for all three healthy: docker compose ps

# 2. backend
cd backend
venv\Scripts\activate
uvicorn main:app --port 8000

# 3. frontend (separate terminal)
cd frontend
npm run dev
```
Open http://localhost:5173. Vite proxies `/api/*` to `127.0.0.1:8000` (see
`frontend/vite.config.js`). All of Docker Compose + backend + frontend must
be running.

**First boot is slow** (sentence-transformers downloads `all-MiniLM-L6-v2`,
~90MB, once) and the startup event re-ingests all 4 seed cases through the
full extract → resolve → Postgres/Neo4j/Qdrant pipeline — give it 20-30s
before hitting the API.

**If Neo4j/Qdrant were still initializing when the backend first started**,
seeding can crash partway (see DECISIONS.md — this happened once during
build). Symptom: `GET /api/cases` returns fewer than 4 rows on a fresh volume.
Fix: wipe and restart —
```
docker exec crimelink-postgres psql -U crimelink -d crimelink -c "TRUNCATE person_case_link, cases, person CASCADE;"
docker exec crimelink-neo4j cypher-shell -u neo4j -p crimelink123 "MATCH (n) DETACH DELETE n;"
curl -X DELETE http://localhost:6333/collections/fir_narratives
# then restart uvicorn
```

Optional: copy `backend/.env.example` to `backend/.env` and set `GROQ_API_KEY`
for LLM-based extraction — works fine without it (falls back to spaCy+regex).

`POST /api/analyze` requires header `X-API-Key: demo-investigator-key`
(default; override via `CRIMELINK_API_KEY` in `.env`). GET endpoints are open.
The frontend already sends this header — only matters if you're calling the
API directly with curl/Postman.

## Repo layout

```
docker-compose.yml   Postgres 16 + Neo4j 5 (with GDS plugin) + Qdrant

backend/
  main.py             FastAPI app + routes + ingest_case() orchestration (entry point)
  extraction.py        entity extraction (Groq LLM, spaCy+regex fallback)
  entity_resolution.py fuzzy person-name resolution (rapidfuzz) against Postgres
  pg.py                Postgres — person / cases / person_case_link tables
  neo.py               Neo4j — graph writes + GDS PageRank/betweenness reads
  vectors.py            Qdrant — MiniLM embeddings + narrative similarity search
  hotspot.py            real NCRB CSV reader + aggregation
  auth.py                API-key auth stub (X-API-Key header, gates POST /api/analyze)
  report.py               LLM-synthesized investigation-lead reports (Groq-first, templated fallback)
  documents.py             evidence file conversion (markitdown) + Groq vision OCR fallback for images
  seed_data.py           synthetic seed FIRs (labeled illustrative in the UI)
  data/ncrb_crime_data.csv   real NCRB district-wise crime stats (data.gov.in)
  venv/                  Python virtualenv (numpy<2.0 / scipy<1.12 pinned — see DECISIONS.md)

frontend/
  src/App.jsx          top-level state + login gate + Network Analysis view (entry point)
  src/LoginScreen.jsx   name-only investigator login (localStorage, not real auth)
  src/SearchPanel.jsx   Smart Search tab (people/cases/locations/phones/vehicles)
  src/PersonProfile.jsx person profile overlay (identity, aliases, contacts, case history)
  src/TimelinePanel.jsx Timeline tab (occurrence date when extracted, else ingestion time)
  src/HotspotPanel.jsx + src/HotspotMap.jsx   Crime Hotspots tab (bar list + Leaflet state map)
  src/stateCentroids.js  approximate Indian state lat/lon lookup (not surveyed geodata)
  src/CasesPanel.jsx    Case Registry tab (persisted cases, seed vs submitted)
  src/CaseWorkspace.jsx  one-case view: narrative, persons, local subgraph, similar cases, report
  src/CatalogBar.jsx     live Postgres/Neo4j/Qdrant counts + expandable real schema registry
  src/i18n.js         translation strings (en/hi/mr/ta/bn)
  src/seedCases.js    sample FIR text for the "load sample" dropdown
  test-app.cjs        Playwright smoke-test script (screenshots + console errors)
```

Root docs: `PRD.md`, `ARCHITECTURE.md`, `DECISIONS.md`, `TASKS.md`, `FLOW.md`,
`README.md` (quick-start), `crimelink-architecture-design.md` and
`Criminal_Intelligence_Architecture_FINAL.png` (the two target architecture
references this build now follows the real data layer of).

## Conventions used in this session

- No comments explaining *what* code does — only *why*, and only where
  non-obvious (see the gazetteer/title-stripping comments in `extraction.py`,
  or the module docstrings in `pg.py`/`neo.py`/`vectors.py` explaining what
  each stands in for vs. the target architecture).
- No premature abstraction — backend modules are flat, one file per store/
  concern, no service layer / repository pattern / DI container.
- Every real-data claim in the UI is honest: synthetic FIR narratives are
  labeled illustrative; the hotspot panel is labeled with its real source.
  Keep that invariant if you add more data.
- Before trusting any aggregation over the NCRB CSV, check for non-district
  rows (`District == "Total"` — already filtered in `hotspot.py`).
- **Postgres `array_agg` over zero rows returns `NULL`, not `'{}'`** — always
  wrap in `COALESCE(..., '{}')` when aggregating into a `NOT NULL` array
  column (bit us once in `pg.add_alias_and_contacts`, see DECISIONS.md).
- After any suspected partial/crashed seed, don't trust `pg.seed_count() == 0`
  alone — explicitly wipe all three stores before restarting (commands above).

## Testing

There's no test suite (out of scope for the time budget). Verification so far
has been:
- `curl` / `docker exec ... psql` / `cypher-shell` against each store directly.
- `frontend/test-app.cjs` — a Playwright script that launches both dev
  servers' pages, clicks through Network → Hotspots → Case Registry →
  language-switch → back-to-Network, screenshots each state, and asserts zero
  console errors. Run with `node test-app.cjs` from `frontend/` (Docker stack
  + both dev servers must already be running). Screenshots land next to it as
  `shot*.png`.

If you change the UI, rerun `test-app.cjs` and actually look at the
screenshots — that's how the "Total" district bug and the tab-switch graph
resize bug were both caught in this session. For backend changes touching the
three stores, query them directly (see the wipe commands above for syntax)
rather than trusting API responses alone — that's how the NULL-array bug and
the partial-seed race were actually found.
