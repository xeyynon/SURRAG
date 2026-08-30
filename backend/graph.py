"""
Builds a co-occurrence network from extracted entities across cases.
Same phone/vehicle/name string = same node, so shared identifiers across
cases automatically surface hidden links between otherwise separate FIRs.
"""
import networkx as nx
from networkx.algorithms.community import greedy_modularity_communities


def node_id(kind: str, value: str) -> str:
    return f"{kind}:{value.strip().lower()}"


def build_graph(cases_with_entities: list[dict]) -> nx.Graph:
    """
    cases_with_entities: list of {cid, fir_number, crime_type, entities: {...}}
    """
    g = nx.Graph()

    for case in cases_with_entities:
        cid = case["cid"]
        ents = case["entities"]
        nodes_in_case = []

        for p in ents.get("persons", []):
            nid = node_id("person", p)
            g.add_node(nid, label=p, type="person")
            nodes_in_case.append(nid)

        for loc in ents.get("locations", []):
            nid = node_id("location", loc)
            g.add_node(nid, label=loc, type="location")
            nodes_in_case.append(nid)

        for ph in ents.get("phones", []):
            nid = node_id("phone", ph)
            g.add_node(nid, label=ph, type="phone")
            nodes_in_case.append(nid)

        for v in ents.get("vehicles", []):
            nid = node_id("vehicle", v)
            g.add_node(nid, label=v, type="vehicle")
            nodes_in_case.append(nid)

        case_node = node_id("case", cid)
        g.add_node(
            case_node,
            label=case.get("fir_number", cid),
            type="case",
            crime_type=case.get("crime_type"),
        )
        nodes_in_case.append(case_node)

        # connect every entity pair that co-occurs in this case
        for i in range(len(nodes_in_case)):
            for j in range(i + 1, len(nodes_in_case)):
                a, b = nodes_in_case[i], nodes_in_case[j]
                if g.has_edge(a, b):
                    g[a][b]["cases"].add(cid)
                else:
                    g.add_edge(a, b, cases={cid})

    return g


def analyze_graph(g: nx.Graph) -> dict:
    if g.number_of_nodes() == 0:
        return {"key_connectors": [], "communities": []}

    pagerank = nx.pagerank(g)
    betweenness = nx.betweenness_centrality(g)

    scored = []
    for nid in g.nodes:
        data = g.nodes[nid]
        if data.get("type") == "case":
            continue
        scored.append(
            {
                "id": nid,
                "label": data.get("label"),
                "type": data.get("type"),
                "pagerank": round(pagerank.get(nid, 0), 4),
                "betweenness": round(betweenness.get(nid, 0), 4),
                "degree": g.degree(nid),
            }
        )
    scored.sort(key=lambda x: (x["betweenness"], x["pagerank"]), reverse=True)
    key_connectors = scored[:5]

    try:
        communities = greedy_modularity_communities(g)
        community_out = [
            {
                "id": i,
                "members": [g.nodes[n]["label"] for n in c if g.nodes[n].get("type") != "case"],
            }
            for i, c in enumerate(communities)
            if len(c) > 1
        ]
    except Exception:
        community_out = []

    return {"key_connectors": key_connectors, "communities": community_out}


def to_cytoscape(g: nx.Graph, highlight_ids: set[str] | None = None) -> dict:
    highlight_ids = highlight_ids or set()
    nodes = [
        {
            "data": {
                "id": nid,
                "label": data.get("label"),
                "type": data.get("type"),
                "highlight": nid in highlight_ids,
            }
        }
        for nid, data in g.nodes(data=True)
    ]
    edges = [
        {
            "data": {
                "id": f"{u}__{v}",
                "source": u,
                "target": v,
                "weight": len(data.get("cases", [])),
            }
        }
        for u, v, data in g.edges(data=True)
    ]
    return {"nodes": nodes, "edges": edges}
