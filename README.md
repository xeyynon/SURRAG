# CrimeLink — Prototype

AI-powered criminal network analysis: paste a new FIR narrative, extract entities
(persons, locations, phones, vehicles), resolve them against known persons, and
see it plotted against a network of prior cases — surfacing hidden connections,
semantically similar cases, and ranking key connector individuals.

Now running on the real three-store architecture from
`crimelink-architecture-design.md`: PostgreSQL (tabular), Neo4j + GDS (graph),
Qdrant (vector) — not an in-memory stand-in.

## Run it

**1. Data layer** (Postgres + Neo4j + Qdrant via Docker):
```
docker compose up -d
docker compose ps   # wait until all three are healthy/running
```

**2. Backend** (FastAPI + spaCy/Groq + Postgres/Neo4j/Qdrant):
```
cd backend
venv\Scripts\activate
uvicorn main:app --port 8000
```
First boot takes ~20-30s (downloads the embedding model once, then seeds 4
sample cases through the full pipeline).

**3. Frontend** (React + Vite + react-force-graph):
```
cd frontend
npm run dev
```

Open http://localhost:5173 — the Vite dev server proxies `/api` to the backend on :8000.

## Optional: better extraction quality

Entity extraction tries Groq (free-tier LLM) first, and falls back to spaCy + regex
automatically if no key is set — so it works out of the box with zero cost.

To enable Groq: copy `backend/.env.example` to `backend/.env` and add a free key from
https://console.groq.com/keys.

## What it demonstrates

Load the pre-loaded "FIR/2026/00300" robbery narrative (default in the sidebar) and
click **Extract & Analyze Network** — it has no full names, yet:
- a shared phone number links it straight into an existing extortion/firearms
  gang cluster (Vijay Shinde / Anil Rao / Bhau Deshmukh) in the **graph path**
  (real Neo4j + GDS PageRank/betweenness), and
- semantic search finds related prior cases by MO in the **vector path**
  (real Qdrant + sentence embeddings) — independently of the graph, per the
  design doc's Use Case 2.

Submit a name variant (e.g. "Bhau" vs. "Bhau Deshmukh") across different FIRs
and check the **Entity Resolution** panel — fuzzy name matching resolves them
to the same person (PID) instead of fragmenting the graph.

Cases persist in Postgres — check the **Case Registry** tab to see every case
submitted so far (seed + yours), and submit related FIRs to see the network
genuinely grow across sessions.

Also in this build (matching `Criminal_Intelligence_App_Flow.png`'s
investigator journey):
- **Login** — name-only, gates the app, attributes every case you submit.
- **Smart Search** — look up any person, case, location, phone, or vehicle.
- **Person profiles** — click any person (graph node, search result, hidden
  connection) to see their resolved identity, aliases, contacts, and full
  case history.
- **Timeline** — every case ordered by real occurrence date when the text
  states one (green), ingestion time otherwise (gray) — clearly labeled.
- **Investigation Lead Report** — an LLM-synthesized summary after every
  analysis, every claim cited to a CID/PID (Groq if `GROQ_API_KEY` is set,
  a templated fallback otherwise — never blank).
- **Evidence upload** — `.txt`/`.pdf`/`.docx`/`.pptx`/`.xlsx`/`.html`/`.csv`/
  images, via `markitdown` + a Groq vision-model OCR fallback for images
  with no text layer. Scanned (image-only) PDFs/Word docs still aren't
  OCR'd — rejected with a clear message, see TASKS.md.
- **Case Workspace** — open any case for its narrative, resolved persons,
  a case-centered local graph, similar cases, and a fresh lead report, all
  in one place.
- **Hotspot map** — state-level markers over the real NCRB data.
- **Data Catalog** — live counts across Postgres/Neo4j/Qdrant, expandable
  to real schema introspection (actual columns/labels/collection config).

`POST /api/analyze` and `/api/upload` require header
`X-API-Key: demo-investigator-key` (the frontend sends this automatically).
Read endpoints are open. See `AGENTS.md` for details, including recovery
steps if the seed data ever ends up partially loaded.

## Docs

`PRD.md` (scope), `ARCHITECTURE.md` (as-built + mapping to both target
architecture docs), `DECISIONS.md` (why each call was made, including two
real bugs found and fixed during the three-store migration), `TASKS.md`
(done vs. known gaps), `FLOW.md` (entry points + call graph).
