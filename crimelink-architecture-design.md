# CrimeLink Architecture — v0.1 (draft, 2026-08-29)

Full version with diagrams published as an artifact: https://claude.ai/code/artifact/e59faf30-346f-4608-a783-1a0a70c66657

## Core idea
Three stores, one shared unique ID, two query directions:
- **Tabular (PostgreSQL)** — filterable index (PIN code, crime type, date).
- **Network graph (Neo4j)** — relationships between persons, cases, phones, vehicles, accounts, locations.
- **Vector store (Qdrant)** — semantic embeddings of FIR narratives and MO (modus operandi) snippets.

Every record — a row, a graph node, a vector payload — carries the same **unique record ID** as its join key. Nothing is cross-referenced by name or free text between stores, only by ID.

## Unique ID strategy
- Random (secure RNG), not sequential — sequential IDs leak case volume and are enumerable.
- Two source-of-truth ID spaces: `person_id (PID)` and `case_id (CID)`. The flat "one row per person-in-a-case" table the user originally described is a **derived master index** built from PID+CID, not its own ground truth.
- Format: `{PID|CID}-{state:2}{district:3}-{random:8}`, e.g. `CID-MH27-84031927`.

## Tabular schema
- `person`: pid (PK), name/aliases, dob, gender, address, phone_numbers[], salted id_hash.
- `case`: cid (PK), fir_number, ps_code/name, pin_code, district, state, crime_type, law_sections[], date_of_occurrence, date_of_fir, status, narrative_text.
- `person_case_link` (**the master index** — what PIN+crime-type filtering actually hits): link_id (PK), pid, cid, role (accused/victim/witness/complainant), denormalized name/pin_code/crime_type/ps_name/fir_number/occurred_on. Composite index on `(pin_code, crime_type, occurred_on)`.

## Graph schema (Neo4j)
Nodes: `:Person(pid)`, `:Case(cid)`, `:Location(pin_code)`, `:Phone`, `:Vehicle`, `:BankAccount`.
Edges: `ACCUSED_IN` / `VICTIM_IN` / `WITNESS_IN` (Person→Case), `OCCURRED_AT` (Case→Location), `USES`/`OWNS`/`HOLDS` (Person→Phone/Vehicle/BankAccount), plus derived edges `CO_ACCUSED_WITH` (Person↔Person, inferred from shared cases) and `SIMILAR_MO_TO` (Case↔Case, written back from vector similarity with a score).
Algorithms: Louvain (community/gang detection), PageRank/betweenness (key-figure ranking), shortest-path (connection queries).

## Vector schema (Qdrant)
- `fir_narrative` collection: one vector per case (full FIR text embedding). Payload: cid, pid_list[], pin_code, district, crime_type, date.
- `mo_pattern` collection: narrower embedding of just the extracted MO snippet, for sharper pattern clustering. Payload: cid, mo_summary, pin_code, crime_type, date.
- Embedding model must be multilingual (e.g. `multilingual-e5-large` or an IndicSBERT variant) — FIRs are routinely filed in Hindi/regional languages, not English only.

## Ingestion pipeline
1. Land raw files (CCTNS/e-FIR dumps, scanned chargesheets, witness statements) in object storage (MinIO).
2. OCR + language normalization (Tesseract + Indic packs).
3. NER entity extraction (names, phones, plates, addresses, weapons, amounts, law sections).
4. Entity resolution: fuzzy-match extracted persons against existing `person` rows (name+DOB+address similarity, exact phone/ID-hash match) → reuse or mint PID.
5. Fan-out write via message queue (Kafka/RabbitMQ) to Postgres (source of truth), Neo4j (MERGE on PID/CID), Qdrant (embeddings with CID payload).
6. Nightly reconciliation job checks ID coverage across all three stores (eventual, not transactional, consistency).

## Use case 1 — hotspot pattern summary
Input: PIN code + crime type + time window (from an alert or analyst).
1. Tabular filter on `master_index` → list of PID/CID.
2. Graph pull: induced subgraph over that ID list + community detection → repeat-offender clusters.
3. Vector pull: **by-ID lookup** (not similarity search) of MO embeddings for those specific CIDs → cluster to find a repeated method.
4. LLM synthesis of trend counts + graph clusters + MO clusters + FIR excerpts → pattern summary report, every claim cited to a CID/PID.

## Use case 2 — new FIR investigation leads
Input: raw text of a new FIR, no PID/CID yet.
1. Same NER extraction pipeline as ingestion.
2. Graph path: fuzzy-match extracted entities against graph nodes → 1-2 hop traversal (co-accused, shared phone/vehicle/address) → surfaces hidden relationships.
3. Vector path (independent, parallel — not chained after graph): embed narrative + MO snippet → top-K similarity search across the **whole** vector store, no tabular filter.
4. Any PID/CID surfaced by either path → profile lookup in Postgres for enrichment.
5. LLM synthesis → investigation lead document: ranked probable connections, associate network, matched MO precedents, each claim cited to an FIR number/CID.

## Suggested open-source stack
PostgreSQL (tabular) · Neo4j Community + GDS (graph) · Qdrant (vector) · Tesseract + Indic packs (OCR) · spaCy custom NER or LLM-based extraction · multilingual-e5-large/IndicSBERT (embeddings) · RabbitMQ/Kafka (fan-out queue) · MinIO (object storage) · FastAPI + Celery (API/orchestration) · React + Leaflet (PIN hotspot map) + Cytoscape.js (network view).

## Open build risks worth tracking
- Entity resolution quality is load-bearing for both use cases — budget real effort here.
- Every LLM-generated claim must cite a CID/PID (summarizing retrieved records, not answering from memory) — required for the output to be usable as investigative/legal input.
- Consistency across the three stores is eventual, not transactional — the reconciliation job is not optional.
- Graph and vector retrieval in use case 2 run independently/in parallel by design, so a miss in one doesn't sink the other.

## Open questions for the team (not yet decided)
- Deployment target (on-prem/govt cloud vs. cloud) was explicitly deferred during this design pass — revisit before build.
- Exact NER approach (trained model vs. LLM extraction) — trade-off between hackathon speed and long-run cost.
- CCTNS/ICJS integration path for real data — not designed here, flagged for follow-up.
