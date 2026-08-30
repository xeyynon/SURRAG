"""
Qdrant — the vector store the prototype previously had none of. Embeds each
case narrative and supports semantic similarity search, independent of the
graph/tabular paths (Use Case 2 in crimelink-architecture-design.md runs this
in parallel with graph traversal, not chained after it).

Model: all-MiniLM-L6-v2 (English-only, ~90MB) instead of the target
architecture's multilingual-e5-large/IndicSBERT — a time-budget trade-off,
see DECISIONS.md. Swap the model name below if multilingual support is added.
"""
import os
import uuid
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct
from dotenv import load_dotenv

load_dotenv()

QDRANT_URL = os.environ.get("CRIMELINK_QDRANT_URL", "http://localhost:6333")
COLLECTION = "fir_narratives"
VECTOR_SIZE = 384

_client = None
_model = None


def get_client():
    global _client
    if _client is None:
        _client = QdrantClient(url=QDRANT_URL)
    return _client


def get_model():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("all-MiniLM-L6-v2")
    return _model


def ensure_collection():
    client = get_client()
    if not client.collection_exists(COLLECTION):
        client.create_collection(
            collection_name=COLLECTION,
            vectors_config=VectorParams(size=VECTOR_SIZE, distance=Distance.COSINE),
        )


def _point_id(cid: str) -> str:
    return str(uuid.uuid5(uuid.NAMESPACE_URL, cid))


def upsert_narrative(cid: str, narrative: str, fir_number: str, crime_type: str) -> None:
    vector = get_model().encode(narrative).tolist()
    get_client().upsert(
        collection_name=COLLECTION,
        points=[
            PointStruct(
                id=_point_id(cid),
                vector=vector,
                payload={"cid": cid, "fir_number": fir_number, "crime_type": crime_type, "narrative": narrative},
            )
        ],
    )


def stats() -> dict:
    info = get_client().get_collection(COLLECTION)
    return {"vectors": info.points_count}


def schema_info() -> dict:
    info = get_client().get_collection(COLLECTION)
    params = info.config.params.vectors
    return {
        "collection": COLLECTION,
        "vector_size": params.size,
        "distance": str(params.distance),
        "embedding_model": "all-MiniLM-L6-v2",
        "payload_fields": ["cid", "fir_number", "crime_type", "narrative"],
    }


def search_similar(narrative: str, top_k: int = 5, exclude_cid: str | None = None) -> list[dict]:
    vector = get_model().encode(narrative).tolist()
    results = get_client().query_points(
        collection_name=COLLECTION, query=vector, limit=top_k + 1
    ).points
    out = []
    for r in results:
        if exclude_cid and r.payload["cid"] == exclude_cid:
            continue
        out.append(
            {
                "cid": r.payload["cid"],
                "fir_number": r.payload["fir_number"],
                "crime_type": r.payload["crime_type"],
                "score": round(r.score, 4),
                "narrative_excerpt": r.payload["narrative"][:160],
            }
        )
    return out[:top_k]
