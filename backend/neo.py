"""
Neo4j + GDS — the graph store from the target architecture, replacing the
prototype's in-memory networkx graph. Same co-occurrence model as before
(every entity extracted from a case gets an edge to every other entity from
that case, weighted by how many cases they co-occur in) but now persisted,
with PageRank/betweenness/Louvain run via real GDS instead of networkx.
"""
import os
import threading
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

NEO4J_URI = os.environ.get("CRIMELINK_NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.environ.get("CRIMELINK_NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.environ.get("CRIMELINK_NEO4J_PASSWORD", "crimelink123")

_driver = None


def get_driver():
    global _driver
    if _driver is None:
        _driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
    return _driver


def init_constraints():
    with get_driver().session() as session:
        session.run("CREATE CONSTRAINT person_pid IF NOT EXISTS FOR (p:Person) REQUIRE p.pid IS UNIQUE")
        session.run("CREATE CONSTRAINT case_cid IF NOT EXISTS FOR (c:Case) REQUIRE c.cid IS UNIQUE")
        session.run("CREATE CONSTRAINT location_name IF NOT EXISTS FOR (l:Location) REQUIRE l.name IS UNIQUE")
        session.run("CREATE CONSTRAINT phone_number IF NOT EXISTS FOR (ph:Phone) REQUIRE ph.number IS UNIQUE")
        session.run("CREATE CONSTRAINT vehicle_reg IF NOT EXISTS FOR (v:Vehicle) REQUIRE v.reg IS UNIQUE")


def _node_key(kind: str, value: str) -> tuple[str, str, str]:
    """Returns (label, match_property, node_id) used consistently across writes/reads."""
    mapping = {
        "person": ("Person", "pid"),
        "location": ("Location", "name"),
        "phone": ("Phone", "number"),
        "vehicle": ("Vehicle", "reg"),
    }
    label, prop = mapping[kind]
    return label, prop, value


def write_case(cid: str, fir_number: str, crime_type: str, resolved_persons: list[dict],
               locations: list[str], phones: list[str], vehicles: list[str]) -> None:
    entities = [("person", p["pid"], p["name"]) for p in resolved_persons]
    entities += [("location", loc, loc) for loc in locations]
    entities += [("phone", ph, ph) for ph in phones]
    entities += [("vehicle", v, v) for v in vehicles]

    with get_driver().session() as session:
        session.run(
            "MERGE (c:Case {cid: $cid}) SET c.fir_number = $fir_number, c.crime_type = $crime_type",
            cid=cid, fir_number=fir_number, crime_type=crime_type,
        )

        for kind, node_id, label_text in entities:
            label, prop = {"person": ("Person", "pid"), "location": ("Location", "name"),
                           "phone": ("Phone", "number"), "vehicle": ("Vehicle", "reg")}[kind]
            session.run(
                f"MERGE (n:{label} {{{prop}: $id}}) SET n.label = $label_text "
                f"WITH n MATCH (c:Case {{cid: $cid}}) MERGE (n)-[:APPEARS_IN]->(c)",
                id=node_id, label_text=label_text, cid=cid,
            )

        # pairwise co-occurrence edges between every entity pair in this case
        for i in range(len(entities)):
            for j in range(i + 1, len(entities)):
                k1, id1, _ = entities[i]
                k2, id2, _ = entities[j]
                label1, prop1 = {"person": ("Person", "pid"), "location": ("Location", "name"),
                                  "phone": ("Phone", "number"), "vehicle": ("Vehicle", "reg")}[k1]
                label2, prop2 = {"person": ("Person", "pid"), "location": ("Location", "name"),
                                  "phone": ("Phone", "number"), "vehicle": ("Vehicle", "reg")}[k2]
                session.run(
                    f"MATCH (a:{label1} {{{prop1}: $id1}}), (b:{label2} {{{prop2}: $id2}}) "
                    "MERGE (a)-[r:CO_OCCURS]-(b) "
                    "ON CREATE SET r.cases = [$cid] "
                    "ON MATCH SET r.cases = CASE WHEN $cid IN r.cases THEN r.cases ELSE r.cases + $cid END",
                    id1=id1, id2=id2, cid=cid,
                )


def to_frontend_graph(highlight_ids: set[str] | None = None) -> dict:
    highlight_ids = highlight_ids or set()
    with get_driver().session() as session:
        node_rows = session.run(
            "MATCH (n) WHERE n:Person OR n:Location OR n:Phone OR n:Vehicle OR n:Case "
            "RETURN elementId(n) AS eid, labels(n)[0] AS label, "
            "coalesce(n.label, n.fir_number) AS text, "
            "coalesce(n.pid, n.name, n.number, n.reg, n.cid) AS node_id"
        ).data()
        edge_rows = session.run(
            "MATCH (a)-[r]-(b) WHERE elementId(a) < elementId(b) "
            "RETURN elementId(a) AS a, elementId(b) AS b, "
            "CASE WHEN type(r) = 'CO_OCCURS' THEN size(r.cases) ELSE 1 END AS weight"
        ).data()

    type_map = {"Person": "person", "Location": "location", "Phone": "phone",
                "Vehicle": "vehicle", "Case": "case"}
    nodes = [
        {
            "data": {
                "id": row["eid"],
                "domain_id": row["node_id"],
                "label": row["text"],
                "type": type_map[row["label"]],
                "highlight": row["node_id"] in highlight_ids,
            }
        }
        for row in node_rows
    ]
    edges = [
        {"data": {"id": f"{row['a']}__{row['b']}", "source": row["a"], "target": row["b"], "weight": row["weight"]}}
        for row in edge_rows
    ]
    return {"nodes": nodes, "edges": edges}


_gds_lock = threading.Lock()


def _score_all() -> list[dict]:
    # The GDS projection has a fixed name and is dropped and rebuilt on every
    # call, so overlapping requests (dashboard + analysis) collided and one
    # returned a 500. Serialise them.
    with _gds_lock, get_driver().session() as session:
        session.run("CALL gds.graph.drop('crimelink', false)")
        session.run(
            "CALL gds.graph.project('crimelink', "
            "['Person','Location','Phone','Vehicle','Case'], "
            "{CO_OCCURS: {orientation: 'UNDIRECTED'}, APPEARS_IN: {orientation: 'UNDIRECTED'}})"
        )

        pagerank = {
            r["nodeId"]: r["score"]
            for r in session.run("CALL gds.pageRank.stream('crimelink') YIELD nodeId, score RETURN nodeId, score").data()
        }
        betweenness = {
            r["nodeId"]: r["score"]
            for r in session.run("CALL gds.betweenness.stream('crimelink') YIELD nodeId, score RETURN nodeId, score").data()
        }

        rows = session.run(
            "MATCH (n) WHERE n:Person OR n:Location OR n:Phone OR n:Vehicle "
            "RETURN id(n) AS internal_id, elementId(n) AS eid, labels(n)[0] AS label, "
            "coalesce(n.label, n.name, n.number, n.reg) AS text, n.pid AS pid, "
            "size([(n)-[:CO_OCCURS]-(m) | m]) AS connections, "
            "size([(n)-[:APPEARS_IN]->() | 1]) AS degree"
        ).data()

        session.run("CALL gds.graph.drop('crimelink', false)")

    type_map = {"Person": "person", "Location": "location", "Phone": "phone", "Vehicle": "vehicle"}
    scored = []
    for row in rows:
        iid = row["internal_id"]
        scored.append(
            {
                "id": row["eid"],
                "label": row["text"],
                "type": type_map[row["label"]],
                "pagerank": round(pagerank.get(iid, 0), 4),
                "betweenness": round(betweenness.get(iid, 0), 4),
                "degree": row["degree"],
                "pid": row["pid"],
                "connections": row["connections"],
            }
        )
    scored.sort(key=lambda x: (x["betweenness"], x["pagerank"]), reverse=True)
    return scored


def analyze() -> dict:
    return {"key_connectors": _score_all()[:5]}


def person_risk() -> dict[str, dict]:
    """Per-person risk derived from graph centrality, not a stored label:
    composite = mean of PageRank and betweenness, each scaled by the max among
    persons. Relative within the current graph, so it shifts as cases are added."""
    persons = [n for n in _score_all() if n["type"] == "person" and n["pid"]]
    max_pr = max((p["pagerank"] for p in persons), default=0) or 1
    max_bt = max((p["betweenness"] for p in persons), default=0) or 1
    out = {}
    for p in persons:
        composite = round((p["pagerank"] / max_pr + p["betweenness"] / max_bt) / 2, 3)
        level = "High" if composite >= 0.66 else "Medium" if composite >= 0.33 else "Low"
        out[p["pid"]] = {
            "risk_level": level, "risk_score": composite, "connections": p["connections"],
            "pagerank": p["pagerank"], "betweenness": p["betweenness"],
        }
    return out


def label_counts() -> dict:
    with get_driver().session() as session:
        rows = session.run("MATCH (n) RETURN labels(n)[0] AS label, count(*) AS c").data()
    return {r["label"]: r["c"] for r in rows}


def search(query: str) -> list[dict]:
    with get_driver().session() as session:
        rows = session.run(
            "MATCH (n) WHERE (n:Location OR n:Phone OR n:Vehicle) AND toLower(n.label) CONTAINS toLower($q) "
            "RETURN labels(n)[0] AS label, coalesce(n.name, n.number, n.reg) AS node_id, n.label AS text "
            "LIMIT 20",
            q=query,
        ).data()
    type_map = {"Location": "location", "Phone": "phone", "Vehicle": "vehicle"}
    return [{"id": r["node_id"], "label": r["text"], "type": type_map[r["label"]]} for r in rows]


def schema_info() -> dict:
    """Real schema introspection (db.labels/db.relationshipTypes/property
    keys observed on live nodes), not a hardcoded description."""
    with get_driver().session() as session:
        labels = [r["label"] for r in session.run("CALL db.labels() YIELD label RETURN label").data()]
        rel_types = [
            r["relationshipType"]
            for r in session.run("CALL db.relationshipTypes() YIELD relationshipType RETURN relationshipType").data()
        ]
        label_props = {}
        for label in labels:
            rows = session.run(f"MATCH (n:{label}) WITH n LIMIT 1 RETURN keys(n) AS props").data()
            label_props[label] = rows[0]["props"] if rows else []
    return {"node_labels": label_props, "relationship_types": rel_types}


def stats() -> dict:
    with get_driver().session() as session:
        nodes = session.run("MATCH (n) RETURN count(n) AS c").single()["c"]
        edges = session.run("MATCH ()-[r]-() RETURN count(r) AS c").single()["c"] // 2
    return {"nodes": nodes, "edges": edges}


def case_subgraph(cid: str) -> dict:
    """All entities attached to one case plus the edges among them — the
    Case Workspace's local graph view, distinct from the full network."""
    with get_driver().session() as session:
        node_rows = session.run(
            "MATCH (c:Case {cid: $cid}) "
            "OPTIONAL MATCH (n)-[:APPEARS_IN]->(c) "
            "WITH c, collect(n) + c AS nodes "
            "UNWIND nodes AS m "
            "RETURN DISTINCT elementId(m) AS eid, labels(m)[0] AS label, "
            "coalesce(m.label, m.fir_number) AS text, "
            "coalesce(m.pid, m.name, m.number, m.reg, m.cid) AS node_id",
            cid=cid,
        ).data()
        edge_rows = session.run(
            "MATCH (c:Case {cid: $cid}) "
            "MATCH (n)-[:APPEARS_IN]->(c) "
            "RETURN DISTINCT elementId(n) AS a, elementId(c) AS b",
            cid=cid,
        ).data()
    type_map = {"Person": "person", "Location": "location", "Phone": "phone",
                "Vehicle": "vehicle", "Case": "case"}
    nodes = [
        {"data": {"id": r["eid"], "domain_id": r["node_id"], "label": r["text"], "type": type_map[r["label"]]}}
        for r in node_rows
    ]
    edges = [
        {"data": {"id": f"{r['a']}__{r['b']}", "source": r["a"], "target": r["b"], "weight": 1}}
        for r in edge_rows
    ]
    return {"nodes": nodes, "edges": edges}


def neighbors_of_entity(kind: str, value: str) -> list[dict]:
    label, prop = {"person": ("Person", "pid"), "location": ("Location", "name"),
                    "phone": ("Phone", "number"), "vehicle": ("Vehicle", "reg")}[kind]
    with get_driver().session() as session:
        rows = session.run(
            f"MATCH (n:{label} {{{prop}: $value}})-[:CO_OCCURS]-(m) "
            "WHERE NOT m:Case "
            "RETURN DISTINCT elementId(m) AS eid, labels(m)[0] AS label, "
            "coalesce(m.label, m.name, m.number, m.reg) AS text, "
            "coalesce(m.pid, m.name, m.number, m.reg) AS node_id",
            value=value,
        ).data()
    type_map = {"Person": "person", "Location": "location", "Phone": "phone", "Vehicle": "vehicle"}
    return [
        {"id": row["node_id"], "label": row["text"], "type": type_map[row["label"]]}
        for row in rows
    ]


_LINK_WEIGHT = {"Person": 3, "Phone": 3, "Vehicle": 3, "Location": 1}
_KIND = {"Person": "person", "Phone": "phone", "Vehicle": "vehicle", "Location": "location"}


def linked_cases(cid: str) -> list[dict]:
    """Earlier cases that share an identifier with this one, and what they
    share. A shared phone, vehicle or person is strong evidence; a shared
    place is weak (many crimes happen in the same locality), so it counts for
    less. Returns one row per earlier case, strongest first, so the officer
    sees not just "linked" but why."""
    with get_driver().session() as session:
        rows = session.run(
            "MATCH (c:Case {cid: $cid})<-[:APPEARS_IN]-(e)-[:APPEARS_IN]->(o:Case) "
            "WHERE o.cid <> $cid AND (e:Person OR e:Phone OR e:Vehicle OR e:Location) "
            "RETURN labels(e)[0] AS kind, coalesce(e.pid, e.number, e.reg, e.name) AS did, "
            "coalesce(e.label, e.name, e.number, e.reg) AS label, "
            "o.cid AS ocid, o.fir_number AS fir, o.crime_type AS crime",
            cid=cid,
        ).data()

    by_case: dict[str, dict] = {}
    for r in rows:
        case = by_case.setdefault(
            r["ocid"], {"cid": r["ocid"], "fir_number": r["fir"], "crime_type": r["crime"], "shared": [], "score": 0}
        )
        case["shared"].append({"type": _KIND[r["kind"]], "id": r["did"], "label": r["label"]})
        case["score"] += _LINK_WEIGHT[r["kind"]]

    out = list(by_case.values())
    for c in out:
        c["strength"] = "strong" if c["score"] >= 6 else "moderate" if c["score"] >= 3 else "weak"
    out.sort(key=lambda c: c["score"], reverse=True)
    return out
