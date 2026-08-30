# DECISIONS.md — decision log

Chronological log of meaningful decisions made while building this prototype,
and why. Newest at the bottom.

---

**Cut the full three-store architecture (Postgres + Neo4j + Qdrant + Kafka +
MinIO) down to a single FastAPI service with an in-memory networkx graph.**
Why: 2-hour build budget. The full architecture (`crimelink-architecture-design.md`)
is a real design for production, not a hackathon build plan — standing up three
databases and a message queue would consume the entire window with nothing to
demo. networkx gives the same graph algorithms (PageRank, betweenness,
community detection) with zero infrastructure.

**Entity extraction: try Groq (LLM) first, fall back to spaCy + regex, chosen
over calling the Anthropic/Claude API.**
Why: user explicitly asked for a free option — the Claude API is paid.
Groq's free tier gives LLM-quality extraction; spaCy+regex is a zero-cost,
zero-internet fallback so a missing API key or a wifi drop during the live
demo can't break the core feature. See `backend/extraction.py`.

**Pinned `numpy<2.0` and `scipy<1.12` in requirements.txt.**
Why: `pip install scipy` (needed by `networkx.pagerank`) pulled numpy 2.5 by
default, which broke spaCy's compiled `thinc` extension (`ValueError:
numpy.dtype size changed` — a binary ABI mismatch). Downgrading both to
versions compiled against the same numpy ABI as spaCy fixed it. This is a real
dependency conflict, not a style choice — don't remove the pins without
retesting `en_core_web_sm` import.

**Added a small gazetteer (`KNOWN_LOCATIONS`, `KNOWN_NON_PERSONS`) in
extraction.py instead of fine-tuning a NER model.**
Why: `en_core_web_sm` (the small spaCy model) mislabeled Indian place names
("Gandhi Nagar", "Nagpur") and vehicle model names ("Maruti Swift") as PERSON.
Training a custom NER model was out of scope for the time budget; a lookup
table that reclassifies known terms in this demo's dataset is a 10-line fix
that makes the seed-data demo reliable. This is a demo-dataset patch, not a
general solution — real deployment would need better NER (see TASKS.md).

**Added `clean_person_name()` to strip title prefixes (Victim/Driver/
Complainant/etc.) and trailing possessives from extracted names.**
Why: spaCy's NER included role prefixes ("Victim Suresh Patil") and
possessives ("Vijay Shinde's") as part of the PERSON span, which created
duplicate graph nodes for the same real person ("Suresh Patil" vs "Victim
Suresh Patil"), fragmenting the network and undercutting the hidden-connection
demo. This cleanup is applied to both the spaCy path and the Groq path, since
an LLM can produce the same kind of noise.

**Used real NCRB district-wise crime statistics (CSV mirrored on GitHub from
data.gov.in) for the hotspot panel, but kept FIR narrative text as clearly
labeled synthetic/illustrative sample data.**
Why: user asked for real data. Individual-level FIR narrative text with
resolvable names/phone numbers/vehicle numbers is restricted CCTNS/police data
— not legally or practically obtainable for a hackathon in two hours (the only
public FIR-related dataset found was a scanned-handwriting OCR research
corpus, which would require building an OCR pipeline). Aggregate district-level
crime statistics, by contrast, are genuinely public government open data. This
is a legal/availability constraint, not a technical one — using real data
where it's actually available, and being honest in the UI about which parts of
the demo are illustrative, was the correct trade-off rather than fabricating
fake "real" narrative data.

**Filtered out rows where `District == "Total"` in the NCRB CSV.**
Why: the source CSV includes a state-level aggregate row per state per year
(District column literally says "Total"), which — being the largest number by
construction — dominated the "top districts" ranking and made every row in the
hotspot panel show "Total" instead of an actual district. Caught this via a
Playwright screenshot during the "test the frontend" pass, not by inspecting
the CSV schema up front — worth remembering to eyeball real data output before
trusting an aggregation.

**Custom `i18n.js` (flat dictionary + `t(key, lang)` helper) instead of
`react-i18next` or similar.**
Why: 5 languages × ~25 UI strings is small enough that a plain object lookup
is less code, fewer dependencies, and easier to review than pulling in a full
i18n library and its provider/hook setup, for a 2-hour prototype.

**`react-force-graph-2d` for the network visualization, not Cytoscape.js.**
Why: force-directed layout, node coloring, and canvas label rendering work out
of the box with a small declarative API — faster to get a polished result
under time pressure than Cytoscape's more verbose stylesheet-based config.

**Added a `zoomToFit` effect keyed on `[tab, result, dims.width, dims.height]`
in App.jsx.**
Why: caught via self-testing with Playwright (the user asked to "test out
frontend, there are some glitches") — switching from the Network tab to the
Hotspots tab and back left the force-graph canvas shrunk and off-center,
because `onEngineStop` (which normally triggers the initial `zoomToFit`) only
fires once when the physics simulation settles, not on every tab
remount/resize. Re-triggering `zoomToFit` whenever the tab becomes active
again (with a short `setTimeout` so the canvas has repainted) fixed it.

---

**Added SQLite persistence (`db.py`), Case Management endpoints, and a
single-API-key auth stub (`auth.py`) — chosen as the highest-value gap
between the prototype and `Criminal_Intelligence_Architecture_FINAL.png`.**
Why: when asked "can we implement the same thing" against that architecture
diagram, building the full stack (ingestion pipeline, API gateway, object
storage, lakehouse, geospatial DB) in the remaining time wasn't realistic —
asked the user to prioritize, and persistence won because it was the most
visibly broken gap: every submitted FIR vanished on refresh, so the demo
couldn't show a network *growing* across multiple investigations. SQLite (not
Postgres/Neo4j) because the goal was covering the gap cheaply, not building
the production data platform — see TASKS.md for what's still stubbed
(single shared API key, no roles, no ingestion layer, no object storage).

**`/api/graph` and `/api/analyze` now build the graph from *all* persisted
cases (`db.all_cases_with_entities()`), not a hardcoded seed list.**
Why: this is what makes the persistence layer actually matter for the demo —
submitting FIR #2 that shares a phone number with FIR #1 now surfaces that
connection *because* FIR #1 is still in the database, not because it was
hardcoded into `seed_data.py`. Verified via Playwright: submitted the same
demo FIR twice, confirmed both submissions appear as separate persisted case
rows in the new Case Registry tab, each with a distinct auto-generated `cid`.

**Auth gate applied only to `POST /api/analyze`, not to the `GET` endpoints.**
Why: read-only endpoints (`/api/cases`, `/api/graph`, `/api/hotspots`) don't
mutate state, and gating them too would have added friction to every judge/
demo interaction (the Cases tab, Hotspot tab) for no protective value at
prototype scope. A real deployment would gate reads too (see TASKS.md) — this
was a demo-usability trade-off, not a security recommendation.

---

**Replaced SQLite + in-memory networkx with real Postgres + Neo4j + Qdrant,
run via Docker Compose.**
Why: after comparing the prototype against both `crimelink-architecture-
design.md` and `Criminal_Intelligence_Architecture_FINAL.png`, the user asked
to "switch to the actual architecture." Docker Compose (not native installs)
because it's the fastest reliable path to three real databases on Windows —
`docker-compose.yml` brings up `postgres:16-alpine`, `neo4j:5-community` (with
the `graph-data-science` plugin enabled via `NEO4J_PLUGINS`), and
`qdrant/qdrant`, each on their standard ports. `db.py` (the SQLite module) and
`graph.py` (the networkx module) were deleted rather than kept alongside —
avoiding two parallel implementations of the same responsibility.

**Chose `rapidfuzz` (`token_set_ratio`, threshold 88) for entity resolution
over exact string match, and over a heavier ML approach.**
Why: user prioritized "entity resolution + vector similarity" as the highest-
value improvement (asked directly, see prior turn). `token_set_ratio` was
picked specifically because it scores a name that's a token subset of another
name as a strong match — e.g. "Anil" vs. "Anil Rao" — which is exactly the
nickname/partial-name pattern that broke the old exact-match approach. A
trained entity-resolution model would need labeled data this prototype
doesn't have; rapidfuzz needs zero training and is a genuine improvement over
what existed before.

**Chose `all-MiniLM-L6-v2` (sentence-transformers, ~90MB, English-only)
instead of the design doc's `multilingual-e5-large`/IndicSBERT for Qdrant
embeddings.**
Why: multilingual embedding models are multi-GB downloads; MiniLM installs
and runs in minutes on CPU. This is a real, acknowledged regression against
the design doc's multilingual requirement (FIRs are routinely filed in
Hindi/regional languages) — not silently accepted, tracked in TASKS.md as the
top follow-up if this goes further. The vector-search *architecture* (Qdrant,
per-case embeddings, independent similarity-search path) is real; the model
quality is the trade-off.

**Kept the co-occurrence graph model (every entity in a case pairwise-linked
via one generic `CO_OCCURS` relationship) instead of switching to the design
doc's typed edges (`ACCUSED_IN`, `USES`, `CO_ACCUSED_WITH`, etc.).**
Why: typed edges require knowing each person's *role* in a case (accused vs.
witness vs. victim) and which specific phone/vehicle belongs to which person
— information the current NER pipeline doesn't extract (it returns four flat
lists per case, not per-person attribution). Modeling typed edges without
that data would mean inventing roles, which is worse than being honest about
what's extracted. This is now a Neo4j graph doing the same job the networkx
graph did, not yet the fully-typed knowledge graph the design doc describes.

**Ran GDS PageRank/betweenness via a graph *projection* dropped and
recreated on every `/api/analyze` call, rather than maintaining a persistent
projection.**
Why: Neo4j GDS algorithms need an in-memory graph projection, and the
underlying graph changes every time a new case is ingested. At demo scale
(tens of nodes) re-projecting on every call is fast enough that maintaining
and incrementally updating a persistent projection wasn't worth the added
complexity — this would need revisiting before any real production scale.

**Fixed: `pg.add_alias_and_contacts()` crashed the whole seeding pass with a
`NotNullViolation` on any person with zero known vehicles (or zero phones).**
Postgres's `array_agg(...)` over zero input rows returns SQL `NULL`, not an
empty array — so a person resolved from a case with no vehicle mentions got
`vehicles = NULL`, violating the `NOT NULL DEFAULT '{}'` column constraint.
Wrapped each aggregate in `COALESCE(..., '{}')`. Caught because the very
first seeding attempt silently ingested only 3 of 4 seed cases before
crashing on the 4th (the case where a new person, Deepak Joshi, had no
vehicle mentioned) — traced by comparing `SELECT * FROM cases` (3 rows)
against `SEED_CASES` (4 entries) and reading the actual Postgres row data
directly, not by trusting the clean-looking server log (see next entry for
why the log looked clean).

**Diagnosed: a stray first backend process silently seeded 3/4 cases, then
crashed, and a second process's `> server.log` redirect truncated the file
and erased the evidence.**
The first `uvicorn ... &` launch actually started (despite the tool output
suggesting otherwise) and began seeding while Neo4j/Qdrant containers were
still finishing initialization seconds after `docker compose up`. It crashed
partway (on the NULL-array bug above) and exited, freeing port 8000. A second
launch then started cleanly, found `pg.seed_count() > 0` (3 rows) and skipped
reseeding entirely, printing a clean "Application startup complete" with no
seeding log lines — the crash was invisible because both launches wrote to
the same `server.log` path with `>` (truncate), not `>>` (append). Fix
applied: after any suspected partial/crashed seed, explicitly wipe all three
stores (`TRUNCATE ... CASCADE` in Postgres, `MATCH (n) DETACH DELETE n` in
Neo4j, delete-and-recreate the Qdrant collection) before restarting, rather
than trusting `seed_count() == 0` to mean "never seeded" — it also means
"seeding previously crashed partway," which looks identical from that check
alone.

---

**User compared the prototype against `Criminal_Intelligence_App_Flow.png`
(a UX-journey diagram: investigator login → case workspace → search/modules/
dashboard, plus a separate data-ingestion flow) and asked to "implement this
all."** Rather than attempt every box literally (some — OCR, Kafka fan-out,
full RBAC+audit, PostGIS — need real infrastructure or design work that
would be reckless to rush), built everything genuinely tractable on top of
the now-real Postgres/Neo4j/Qdrant data, and explicitly deferred the rest
with reasons (see TASKS.md) rather than faking them or silently dropping
them.

**Added `report.py` — LLM-synthesized investigation-lead reports, Groq-first
with a deterministic templated fallback.**
Why: this was independently flagged as "the single biggest remaining gap"
against what both architecture docs call the actual deliverable (every claim
cited to a CID/PID, not just raw graph/vector output). Reused the same
Groq-first/fallback pattern as `extraction.py` rather than inventing a new
one — consistent, and the feature never hard-depends on an API key. The
fallback is templated bullet points assembled from the same structured data
(hidden connections, key connectors, similar cases) so a report always
exists, just without prose quality when no key is set.

**Added `entity_resolution`-adjacent `pg.search()`/`neo.search()` for Smart
Search, rather than a dedicated search index (Elasticsearch/OpenSearch).**
Why: Postgres `ILIKE` over `person`/`cases` and a Neo4j `CONTAINS` scan over
`Location`/`Phone`/`Vehicle` nodes is correct at demo scale (tens to
hundreds of rows) and needs zero new infrastructure. A real search index
would matter at production data volume, not here.

**Person & Entity Profiling was prioritized as the first UX piece built**
(over Case Workspace or full RBAC), per the earlier assessment that the
underlying data (Postgres `person` table, Neo4j case links) was already real
and just needed a view — the highest ratio of value to remaining effort.

**District-coded PID/CID (`pg.new_id`) uses the first extracted *location
string* as a slug, not an official state/district code table.**
Why: crimelink-architecture-design.md's `{PID|CID}-{state}{district}-
{random:8}` scheme needs an authoritative code table (e.g. the NCRB's
district codes) that isn't part of any dataset already in this project. Using
the raw location text is honestly labeled "best-effort, not full
conformance" in both the code comment and TASKS.md, rather than inventing
fake codes that would look authoritative but aren't.

**Evidence upload accepts `.txt` files only — explicitly rejects images/PDFs
with an in-response message, rather than attempting any form of OCR.**
Why: real OCR (Tesseract + Indic-language packs, per the design doc) is a
genuine sub-project — new binary dependencies, image preprocessing, accuracy
tuning — not a corner that can be cut safely in the time available. An honest
"not supported yet" beats a fake/broken OCR path that would misrepresent
scanned evidence as processed.

**Investigator login is name-only, stored in `localStorage`, gating the UI
and threading through as `X-Investigator-Name` for case attribution
(`cases.submitted_by`) — not real authentication.**
Why: this satisfies the UX diagram's login step and gives genuine
per-submission attribution (useful for a real chain-of-custody trail later)
without pretending to be secure. No password, no session token, no server-
side identity verification — a determined attacker could claim to be anyone.
Explicitly not sufficient for real deployment; see TASKS.md.

**Hotspot map uses a small hardcoded state-centroid lookup
(`stateCentroids.js`, ~36 entries) plus Leaflet, aggregating the existing
NCRB district data up to state level — not a real geospatial database.**
Why: the NCRB CSV carries no coordinates at all, and there's no PostGIS/
geospatial store in this build. The centroids are public-knowledge
approximate state-capital-region coordinates (documented as such in the file
and in the UI caption), not surveyed data — good enough to show "which
states," not precise enough for anything address-level. Switched the map
tile provider from CartoDB's dark basemap (its free tier started requiring
an API key mid-session, confirmed by a literal "API key required" watermark
appearing on the rendered map) to standard OpenStreetMap tiles, which are
free with no key — caught via the same screenshot-then-look discipline used
throughout this session, not assumed to work.

**Deferred (with reasons, not silently dropped): OCR, Kafka/RabbitMQ fan-out
+ nightly reconciliation, MinIO object storage, a real API Gateway
(rate-limiting/routing), full RBAC + audit trail, a real geospatial
database, a multilingual embedding model, and typed Neo4j edges.**
Each needs either new infrastructure this session doesn't have running
(Kafka, MinIO, PostGIS), a redesign of the extraction pipeline to attribute
roles/contacts per person (typed edges), a large model download beyond the
time budget already spent (multilingual embeddings), or careful security
design rather than a rushed implementation (real RBAC+audit). Listed
explicitly in TASKS.md rather than left implicit, so the gap is visible
rather than assumed-covered.

---

**Closed five of the App Flow gaps in one pass**: real occurrence-date
extraction, broader Evidence Upload formats, a real Data Catalog/schema
registry, and a Case Workspace — each described below.

**Occurrence-date extraction (`extraction.py`'s `parse_occurrence_date`)
uses spaCy's DATE entities + `dateutil.parser(fuzzy=True)`, sanity-bounded to
1990–2035, with vague words (`today`/`yesterday`/etc.) explicitly excluded.**
Why the year bound and exclusion list: `dateutil` will happily "parse" a
vague or malformed span into some plausible-looking date, and a fabricated
occurrence date is worse than an honest `None` for an investigative tool —
most narrative text has no explicit date at all, and the UI says so
(`TimelinePanel` labels which cases have a real extracted date vs. which
fall back to ingestion time). Also discovered mid-fix: `seed_data.py` already
carried a structured `date` field per seed case that had *never been wired
through* to Postgres since the SQLite→Postgres migration — an existing
oversight, not new work, fixed by threading it through `ingest_case()` as
ground truth (no extraction needed) alongside the new narrative-text path
for investigator-submitted FIRs.

**Evidence upload broadened via `markitdown` (PDF/Word/Excel/PowerPoint/
HTML/CSV) plus a Groq vision-model OCR fallback for images — chosen over
Tesseract.** Why: researched at the user's request (a list of external
tools/repos), and `markitdown` converts far more formats than the
`pypdf`+`python-docx` combo installed earlier this session (which,
notably, got installed but never actually wired into `/api/upload` before
this — replaced before ever shipping). For genuinely scanned/image content
with no text layer, a Groq vision call (`documents.ocr_with_groq_vision`)
transcribes it — reusing the free-tier Groq pattern already established in
`extraction.py`, instead of a Tesseract binary dependency this session was
avoiding on Windows. Explicitly still not covered: scanned (image-only)
PDFs/Word docs — OCR only triggers for standalone image files, since
markitdown doesn't expose page images from a scanned PDF for the vision
fallback to run on. That remaining gap is stated plainly in the upload error
message and in TASKS.md, not glossed over.

**Sentry and Supabase/Vercel MCP were researched but not integrated —
user's call after being asked, then explicitly removed once drafted.**
Sentry SDK was briefly wired (DSN read from an optional env var, genuine
no-op without one) before the user flagged "sentry is paid ig" and asked for
its removal; pulled the SDK, the init code, and the dependency back out
rather than leave a disabled stub — matches the user's "we will see later"
on Supabase/Vercel too. Nothing in the running app depends on any of the
three.

**Data Catalog upgraded from a live-counts strip to real schema
introspection** (`pg.schema_info()` via `information_schema.columns`,
`neo.schema_info()` via `db.labels()`/`db.relationshipTypes()`,
`vectors.schema_info()` via Qdrant's collection config) — genuinely answers
"what fields exist," not a hardcoded description that would drift from the
actual schema as it evolves.

**Case Workspace's local graph (`neo.case_subgraph`) initially showed
entities correctly but with the Case node visually disconnected from
everything else — caught via screenshot, not assumed.** The first version
only drew edges between entity *pairs* that shared a `CO_OCCURS`
relationship, omitting the `APPEARS_IN` edges from each entity to the Case
node itself. Fixed to draw a case-centered star (every entity → its case),
which is both simpler and more correct for a per-case view than reproducing
the full pairwise clique. Also had to add `onEngineStop`-triggered
`zoomToFit` (the same fix pattern as the main network graph, back in the
persistence round) — a time-based `zoomToFit` fired before the force layout
had spread the nodes out, leaving them scattered outside the visible
viewport.

**`neo.to_frontend_graph` and the new `case_subgraph` both needed a
`domain_id` field added *before* shipping the Case Workspace's node-click
handler** — caught by re-checking the same class of bug documented earlier
in this file (Neo4j's internal `elementId` isn't a valid PID/CID for
`/api/persons/{pid}` lookups) rather than repeating it in new code.

**Frontend motion polish (Framer Motion, imported as the `motion` package)
applied narrowly**: login screen entrance stagger, a view-crossfade on
tab/profile/workspace navigation, and a fade-in on the analyze results
panel. Why narrow, not a full redesign: the user asked me to evaluate a long
list of design/animation resources and apply what's useful — motion was the
one with an immediate, low-risk win (real transitions where there were
none); a full typography/color-system overhaul (per the `claude-frontend-
skills`-style principles also reviewed) would be a much larger, more
subjective change better done as its own deliberate pass, not folded into
this round.

---

**Fixed: `SearchPanel.jsx` had no error handling — a failed `fetch` (network
hiccup, backend mid-restart) failed completely silently, which is
indistinguishable from "search is broken" to a user.** Could not reproduce
the user-reported failure directly (search worked in every automated
Playwright pass, including Enter-key submit and clicking through to a
result), but the silent-failure gap was real regardless of the exact
trigger — fixed by catching, surfacing an error message in the UI, and
clearing stale results on failure, so a future transient failure is visible
instead of invisible.

**Fixed: the Hotspots tab label and source line said "Real NCRB Data" /
"real government statistics" — the word "real" read oddly in a shipped UI
(it's real to us as builders, not a claim a user needs asserted at them)
and the user asked for it removed.** Dropped "Real"/"real" from the
user-facing strings in all 5 languages; kept it in code comments/docs where
it's contrasting against synthetic data, which is legitimate internal
context, not UI copy.

**Fixed: selecting a state in the Hotspots dropdown didn't move the map —
`HotspotMap` was never actually passed the selected `state` prop.** A real
wiring gap, not a Leaflet limitation: `<HotspotMap crimeType={crimeType} />`
in `HotspotPanel.jsx` dropped `state` entirely. Fixed by passing it through
and adding a `FlyToState` child component that calls Leaflet's `map.flyTo()`
via `useMap()` — `MapContainer`'s `center`/`zoom` props only apply on first
mount, so this has to be imperative, not declarative. Also highlights the
selected state's marker (gold, larger) so the selection is visually
confirmed beyond just the pan.
