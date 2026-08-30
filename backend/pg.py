"""
PostgreSQL — the tabular store from the target architecture. Replaces the
SQLite prototype (db.py, now retired) with real `person` / `cases` /
`person_case_link` tables, matching crimelink-architecture-design.md's schema
(simplified: no salted id_hash, no full PID/CID district-coded format —
see DECISIONS.md).
"""
import os
import json
import secrets
import psycopg
from psycopg.rows import dict_row
from dotenv import load_dotenv

load_dotenv()

PG_DSN = os.environ.get(
    "CRIMELINK_PG_DSN", "postgresql://crimelink:crimelink@localhost:5432/crimelink"
)


def get_connection():
    return psycopg.connect(PG_DSN, row_factory=dict_row)


def init_db():
    with get_connection() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS person (
                pid TEXT PRIMARY KEY,
                canonical_name TEXT NOT NULL,
                aliases TEXT[] NOT NULL DEFAULT '{}',
                phones TEXT[] NOT NULL DEFAULT '{}',
                vehicles TEXT[] NOT NULL DEFAULT '{}',
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cases (
                cid TEXT PRIMARY KEY,
                fir_number TEXT NOT NULL,
                crime_type TEXT NOT NULL,
                narrative TEXT NOT NULL,
                entities_json JSONB NOT NULL,
                source TEXT NOT NULL,
                is_seed BOOLEAN NOT NULL DEFAULT false,
                submitted_by TEXT,
                occurred_on DATE,
                created_at TIMESTAMPTZ NOT NULL DEFAULT now()
            )
            """
        )
        conn.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS submitted_by TEXT")
        conn.execute("ALTER TABLE cases ADD COLUMN IF NOT EXISTS occurred_on DATE")
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS person_case_link (
                link_id SERIAL PRIMARY KEY,
                pid TEXT NOT NULL REFERENCES person(pid),
                cid TEXT NOT NULL REFERENCES cases(cid),
                created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
                UNIQUE (pid, cid)
            )
            """
        )
        conn.commit()


def new_id(prefix: str, locations: list[str] | None = None) -> str:
    """Best-effort district-coded ID (crimelink-architecture-design.md's
    {PID|CID}-{state}{district}-{random:8} scheme). We don't have an official
    state/district code table, so this uses the first extracted location as a
    slug instead of a real code — an approximation, not full conformance
    (see DECISIONS.md)."""
    if locations:
        slug = "".join(ch for ch in locations[0].upper() if ch.isalnum())[:6] or "XX0000"
    else:
        slug = "XX0000"
    return f"{prefix}-{slug}-{secrets.token_hex(4).upper()}"


def list_persons() -> list[dict]:
    with get_connection() as conn:
        return conn.execute("SELECT * FROM person").fetchall()


def get_person(pid: str) -> dict | None:
    with get_connection() as conn:
        return conn.execute("SELECT * FROM person WHERE pid = %s", (pid,)).fetchone()


def create_person(canonical_name: str) -> str:
    pid = new_id("PID")
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO person (pid, canonical_name) VALUES (%s, %s)",
            (pid, canonical_name),
        )
        conn.commit()
    return pid


def add_alias_and_contacts(pid: str, name: str, phones: list[str], vehicles: list[str]) -> None:
    with get_connection() as conn:
        conn.execute(
            """
            UPDATE person SET
                aliases = (SELECT COALESCE(array_agg(DISTINCT x), '{}') FROM unnest(aliases || %s::text[]) AS x),
                phones = (SELECT COALESCE(array_agg(DISTINCT x), '{}') FROM unnest(phones || %s::text[]) AS x),
                vehicles = (SELECT COALESCE(array_agg(DISTINCT x), '{}') FROM unnest(vehicles || %s::text[]) AS x)
            WHERE pid = %s
            """,
            ([name], phones, vehicles, pid),
        )
        conn.commit()


def insert_case(cid, fir_number, crime_type, narrative, entities, is_seed=False,
                 submitted_by=None, occurred_on=None) -> None:
    with get_connection() as conn:
        conn.execute(
            """INSERT INTO cases (cid, fir_number, crime_type, narrative, entities_json, source, is_seed, submitted_by, occurred_on)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (cid) DO NOTHING""",
            (
                cid,
                fir_number,
                crime_type,
                narrative,
                json.dumps(entities),
                entities.get("source", "unknown"),
                is_seed,
                submitted_by,
                occurred_on,
            ),
        )
        conn.commit()


def link_person_case(pid: str, cid: str) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO person_case_link (pid, cid) VALUES (%s, %s) ON CONFLICT DO NOTHING",
            (pid, cid),
        )
        conn.commit()


def list_cases() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM cases ORDER BY created_at DESC").fetchall()
        for r in rows:
            r["entities"] = r.pop("entities_json")
        return rows


def get_case(cid: str) -> dict | None:
    with get_connection() as conn:
        r = conn.execute("SELECT * FROM cases WHERE cid = %s", (cid,)).fetchone()
        if r:
            r["entities"] = r.pop("entities_json")
        return r


def seed_count() -> int:
    with get_connection() as conn:
        return conn.execute("SELECT COUNT(*) AS c FROM cases WHERE is_seed = true").fetchone()["c"]


def get_case_persons(cid: str) -> list[dict]:
    with get_connection() as conn:
        return conn.execute(
            """SELECT p.* FROM person p
               JOIN person_case_link l ON l.pid = p.pid
               WHERE l.cid = %s""",
            (cid,),
        ).fetchall()


def get_person_profile(pid: str) -> dict | None:
    with get_connection() as conn:
        person = conn.execute("SELECT * FROM person WHERE pid = %s", (pid,)).fetchone()
        if person is None:
            return None
        cases = conn.execute(
            """SELECT c.* FROM cases c
               JOIN person_case_link l ON l.cid = c.cid
               WHERE l.pid = %s ORDER BY c.created_at DESC""",
            (pid,),
        ).fetchall()
        for c in cases:
            c["entities"] = c.pop("entities_json")
        person["cases"] = cases
        return person


def search(query: str) -> dict:
    like = f"%{query}%"
    with get_connection() as conn:
        persons = conn.execute(
            """SELECT * FROM person WHERE canonical_name ILIKE %s
               OR EXISTS (SELECT 1 FROM unnest(aliases) a WHERE a ILIKE %s)""",
            (like, like),
        ).fetchall()
        cases = conn.execute(
            """SELECT cid, fir_number, crime_type, narrative, created_at, is_seed FROM cases
               WHERE fir_number ILIKE %s OR narrative ILIKE %s OR crime_type ILIKE %s
               ORDER BY created_at DESC LIMIT 20""",
            (like, like, like),
        ).fetchall()
        return {"persons": persons, "cases": cases}


def timeline(pid: str | None = None) -> list[dict]:
    order_key = "COALESCE(c.occurred_on::timestamptz, c.created_at)"
    with get_connection() as conn:
        if pid:
            rows = conn.execute(
                f"""SELECT c.cid, c.fir_number, c.crime_type, c.created_at, c.occurred_on, c.is_seed FROM cases c
                   JOIN person_case_link l ON l.cid = c.cid
                   WHERE l.pid = %s ORDER BY {order_key} ASC""",
                (pid,),
            ).fetchall()
        else:
            rows = conn.execute(
                f"SELECT cid, fir_number, crime_type, created_at, occurred_on, is_seed FROM cases c "
                f"ORDER BY {order_key} ASC"
            ).fetchall()
        return rows


def schema_info() -> list[dict]:
    """Real schema introspection (information_schema), not a hardcoded
    description — the Data Catalog's 'what fields exist' answer."""
    with get_connection() as conn:
        rows = conn.execute(
            """SELECT table_name, column_name, data_type, is_nullable
               FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name IN ('person', 'cases', 'person_case_link')
               ORDER BY table_name, ordinal_position"""
        ).fetchall()
    tables: dict[str, list[dict]] = {}
    for r in rows:
        tables.setdefault(r["table_name"], []).append(
            {"column": r["column_name"], "type": r["data_type"], "nullable": r["is_nullable"] == "YES"}
        )
    return [{"table": name, "columns": cols} for name, cols in tables.items()]


def catalog_stats() -> dict:
    with get_connection() as conn:
        persons = conn.execute("SELECT COUNT(*) AS c FROM person").fetchone()["c"]
        cases = conn.execute("SELECT COUNT(*) AS c FROM cases").fetchone()["c"]
        submitted = conn.execute("SELECT COUNT(*) AS c FROM cases WHERE is_seed = false").fetchone()["c"]
        return {"persons": persons, "cases": cases, "submitted_cases": submitted}
