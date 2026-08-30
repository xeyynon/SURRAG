from fastapi import FastAPI, Depends, Header, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import pg
import neo
import vectors
import documents
from seed_data import SEED_CASES
from extraction import extract_entities
from entity_resolution import resolve_case_persons
from hotspot import list_states, list_districts, get_hotspots, CRIME_COLUMNS
from auth import require_api_key
from report import synthesize_report

app = FastAPI(title="CrimeLink Prototype API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


def ingest_case(cid: str, fir_number: str, crime_type: str, narrative: str,
                 is_seed: bool = False, submitted_by: str | None = None, entities: dict | None = None,
                 occurred_on: str | None = None) -> dict:
    """Shared ingestion pipeline: extract -> resolve -> write to all three stores.
    Mirrors Criminal_Intelligence_App_Flow.png's Data Ingestion flow (Begin
    Processing Job -> Clean & Standardize -> Extract Metadata -> Load to Crime
    Data Lakehouse), minus OCR and an async job queue — see DECISIONS.md.
    Pass `entities` if already extracted by the caller (avoids re-running NER).
    `occurred_on` (ISO date) is ground truth for seed cases; for submitted
    cases it falls back to whatever extract_entities() found in the text
    (often None — most narrative text has no explicit date)."""
    if entities is None:
        entities = extract_entities(narrative)
    if occurred_on is None:
        occurred_on = entities.get("occurred_on")
    resolved_persons = resolve_case_persons(
        entities.get("persons", []), entities.get("phones", []), entities.get("vehicles", [])
    )

    pg.insert_case(cid, fir_number, crime_type, narrative, entities, is_seed=is_seed,
                    submitted_by=submitted_by, occurred_on=occurred_on)
    for p in resolved_persons:
        pg.link_person_case(p["pid"], cid)

    neo.write_case(
        cid, fir_number, crime_type, resolved_persons,
        entities.get("locations", []), entities.get("phones", []), entities.get("vehicles", []),
    )

    vectors.upsert_narrative(cid, narrative, fir_number, crime_type)

    return {"entities": entities, "resolved_persons": resolved_persons}


def build_analysis_response(cid: str, narrative: str, entities: dict, resolved_persons: list[dict]) -> dict:
    new_entity_refs = [("person", p["pid"]) for p in resolved_persons]
    new_entity_refs += [("location", v) for v in entities.get("locations", [])]
    new_entity_refs += [("phone", v) for v in entities.get("phones", [])]
    new_entity_refs += [("vehicle", v) for v in entities.get("vehicles", [])]
    new_ids = {v for _, v in new_entity_refs}

    hidden = {}
    for kind, value in new_entity_refs:
        for n in neo.neighbors_of_entity(kind, value):
            if n["id"] not in new_ids:
                hidden[n["id"]] = n
    hidden_connections = list(hidden.values())

    similar_cases = vectors.search_similar(narrative, top_k=5, exclude_cid=cid)
    insights = neo.analyze()

    case = pg.get_case(cid)
    report = synthesize_report(case, resolved_persons, hidden_connections, insights["key_connectors"], similar_cases)

    return {
        "cid": cid,
        "narrative": narrative,
        "extracted_entities": entities,
        "resolved_persons": resolved_persons,
        "graph": neo.to_frontend_graph(highlight_ids=new_ids),
        "insights": insights,
        "hidden_connections": hidden_connections,
        "similar_cases": similar_cases,
        "report": report,
    }


@app.on_event("startup")
def on_startup():
    pg.init_db()
    neo.init_constraints()
    vectors.ensure_collection()

    if pg.seed_count() == 0:
        for case in SEED_CASES:
            ingest_case(case["cid"], case["fir_number"], case["crime_type"], case["narrative"],
                        is_seed=True, occurred_on=case.get("date"))


class AnalyzeRequest(BaseModel):
    narrative: str
    fir_number: str = "NEW-FIR"
    crime_type: str = "Unclassified"


@app.get("/api/seed")
def get_seed():
    return {"cases": SEED_CASES}


@app.get("/api/cases")
def api_list_cases():
    return {"cases": pg.list_cases()}


@app.get("/api/cases/{cid}")
def api_get_case(cid: str):
    case = pg.get_case(cid)
    if case is None:
        return {"error": "not found"}, 404
    return case


@app.get("/api/graph")
def get_graph():
    return {"graph": neo.to_frontend_graph(), "insights": neo.analyze()}


@app.post("/api/analyze")
def analyze_new_fir(req: AnalyzeRequest, _auth: str = Depends(require_api_key),
                     x_investigator_name: str | None = Header(default=None)):
    entities = extract_entities(req.narrative)
    cid = pg.new_id("CID", locations=entities.get("locations"))
    result = ingest_case(cid, req.fir_number, req.crime_type, req.narrative,
                          submitted_by=x_investigator_name, entities=entities)
    return build_analysis_response(cid, req.narrative, result["entities"], result["resolved_persons"])


@app.post("/api/upload")
async def upload_evidence(file: UploadFile = File(...), fir_number: str = Form("UPLOADED-EVIDENCE"),
                           crime_type: str = Form("Unclassified"), _auth: str = Depends(require_api_key),
                           x_investigator_name: str | None = Header(default=None)):
    """Evidence & Data Ingestion (Criminal_Intelligence_App_Flow.png's Upload
    Data step). Accepts .txt/.pdf/.docx/.pptx/.xlsx/.html/.csv/images via
    documents.py (markitdown + Groq-vision OCR fallback for images with no
    text layer). Scanned PDFs/Word docs with no embedded text still aren't
    OCR'd — see documents.py and DECISIONS.md."""
    raw = await file.read()
    extracted = documents.extract_text(file.filename, raw)
    if extracted["error"]:
        return {"error": extracted["error"]}
    narrative = extracted["text"]

    entities = extract_entities(narrative)
    cid = pg.new_id("CID", locations=entities.get("locations"))
    result = ingest_case(cid, fir_number, crime_type, narrative,
                          submitted_by=x_investigator_name, entities=entities)
    response = build_analysis_response(cid, narrative, result["entities"], result["resolved_persons"])
    response["extraction_method"] = extracted["method"]
    return response


@app.get("/api/cases/{cid}/workspace")
def api_case_workspace(cid: str):
    """Case Workspace — everything about one case in one place
    (Criminal_Intelligence_App_Flow.png's 'Select Case / Investigation
    Workspace' step): the case record, its resolved persons, its local
    subgraph, similar prior cases, and a freshly-synthesized lead report."""
    case = pg.get_case(cid)
    if case is None:
        return {"error": "not found"}, 404

    persons = pg.get_case_persons(cid)
    resolved_persons = [{"pid": p["pid"], "name": p["canonical_name"], "is_new": False} for p in persons]
    similar_cases = vectors.search_similar(case["narrative"], top_k=5, exclude_cid=cid)
    insights = neo.analyze()
    report = synthesize_report(case, resolved_persons, [], insights["key_connectors"], similar_cases)

    return {
        "case": case,
        "persons": persons,
        "subgraph": neo.case_subgraph(cid),
        "similar_cases": similar_cases,
        "report": report,
    }


@app.get("/api/persons/{pid}")
def api_get_person(pid: str):
    profile = pg.get_person_profile(pid)
    if profile is None:
        return {"error": "not found"}, 404
    return profile


@app.get("/api/search")
def api_search(q: str):
    pg_results = pg.search(q)
    neo_results = neo.search(q)
    return {
        "persons": pg_results["persons"],
        "cases": pg_results["cases"],
        "entities": neo_results,
    }


@app.get("/api/timeline")
def api_timeline(pid: str | None = None):
    return {"events": pg.timeline(pid)}


@app.get("/api/catalog")
def api_catalog():
    return {
        "postgres": pg.catalog_stats(),
        "neo4j": neo.stats(),
        "qdrant": vectors.stats(),
    }


@app.get("/api/catalog/schema")
def api_catalog_schema():
    """Data Catalog / schema registry — real introspection of each store's
    live schema, not a hand-maintained description (Criminal_Intelligence_
    App_Flow.png's 'Update Data Catalog' step)."""
    return {
        "postgres": pg.schema_info(),
        "neo4j": neo.schema_info(),
        "qdrant": vectors.schema_info(),
    }


@app.get("/api/hotspots")
def hotspots(state: str | None = None, crime_type: str = CRIME_COLUMNS[0], top_n: int = 10):
    return {
        "states": list_states(),
        "crime_types": CRIME_COLUMNS,
        "results": get_hotspots(state, crime_type, top_n),
        "source": "NCRB district-wise crime data (data.gov.in)",
    }


@app.get("/api/hotspots/by_state")
def hotspots_by_state(crime_type: str = CRIME_COLUMNS[0]):
    """Aggregated to state level for the map view — the NCRB CSV has no
    lat/lon, so the frontend joins this against a small static state-centroid
    lookup table rather than a real geospatial DB (see DECISIONS.md)."""
    results = get_hotspots(None, crime_type, top_n=10_000)
    by_state: dict[str, int] = {}
    for r in results:
        by_state[r["state"]] = by_state.get(r["state"], 0) + r["count"]
    return {"crime_type": crime_type, "results": [{"state": s, "count": c} for s, c in by_state.items()]}


@app.get("/api/health")
def health():
    return {"status": "ok"}
