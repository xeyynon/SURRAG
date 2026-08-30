"""
Entity resolution — the piece the prototype previously had none of (persons
were matched by exact lowercased string only, so "Bhau" and "Bhau Deshmukh"
became two separate-but-linked nodes instead of one person). Real per-case
data would resolve on name+DOB+address+phone/ID-hash (see
crimelink-architecture-design.md); at prototype scale we only have names and
loosely-associated phones/vehicles per case, so this resolves on fuzzy name
similarity (handles nicknames/partial names/aliases), creating a new PID only
when nothing matches well enough.
"""
from rapidfuzz import fuzz

import pg

MATCH_THRESHOLD = 88  # token_set_ratio: handles "Bhau" vs "Bhau Deshmukh" (subset names)


def resolve_person(name: str) -> tuple[str, bool]:
    """Returns (pid, is_new_person)."""
    persons = pg.list_persons()
    best_pid, best_score = None, 0
    for p in persons:
        candidates = [p["canonical_name"], *p["aliases"]]
        score = max(fuzz.token_set_ratio(name, c) for c in candidates)
        if score > best_score:
            best_score, best_pid = score, p["pid"]

    if best_score >= MATCH_THRESHOLD:
        return best_pid, False

    pid = pg.create_person(name)
    return pid, True


def resolve_case_persons(person_names: list[str], phones: list[str], vehicles: list[str]) -> list[dict]:
    """Resolve every person name extracted from one case, and attach that
    case's phones/vehicles to each resolved person as known contacts."""
    resolved = []
    for name in person_names:
        pid, is_new = resolve_person(name)
        pg.add_alias_and_contacts(pid, name, phones, vehicles)
        resolved.append({"pid": pid, "name": name, "is_new": is_new})
    return resolved
