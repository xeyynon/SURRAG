# SURRAG

AI-assisted criminal-network analysis prototype. Paste or upload an FIR,
extract entities, resolve people across cases, link cases in a graph, and
get a cited investigation-lead report.

## Stack

- **Backend**: FastAPI, Postgres, Neo4j (GDS), Qdrant, Groq (optional LLM
  extraction with a spaCy/regex fallback).
- **Frontend**: React + Vite + Tailwind, a force-directed graph, and an
  India-only choropleth for crime-hotspot data.

## Running locally

```
docker compose up -d          # Postgres + Neo4j + Qdrant

cd backend
venv\Scripts\activate
uvicorn main:app --port 8000

cd frontend
npm run dev
```

Open http://localhost:3100. Set `GROQ_API_KEY` in `backend/.env` (not
committed) for LLM-based extraction; the app works without it.

## Notes

- Synthetic FIR narratives used for demos are labeled illustrative in the
  UI. The crime-hotspot panel is sourced from public NCRB data.
- Non-English UI strings are machine-translated and have not been reviewed
  by native speakers.
