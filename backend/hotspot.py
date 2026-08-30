"""
Real NCRB district-wise crime statistics (source: data.gov.in / NCRB "Crime in
India" district-level release, mirrored as CSV). Used for the hotspot summary
panel — genuine government numbers, not synthetic demo data.
"""
import csv
import os

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "ncrb_crime_data.csv")

# a representative subset of offense columns to expose in the UI
CRIME_COLUMNS = [
    "Murder",
    "Rape other than Custodial",
    "Kidnapping & Abduction_Total",
    "Dacoity",
    "Robbery",
    "Theft",
    "Riots",
]

_rows = None


def load_rows():
    global _rows
    if _rows is None:
        with open(DATA_PATH, newline="", encoding="utf-8") as f:
            _rows = list(csv.DictReader(f))
    return _rows


def list_states() -> list[str]:
    rows = load_rows()
    return sorted({r["States/UTs"].strip() for r in rows if r.get("States/UTs")})


def list_districts(state: str | None = None) -> list[str]:
    rows = load_rows()
    if state:
        rows = [r for r in rows if r["States/UTs"].strip().lower() == state.strip().lower()]
    return sorted(
        {r["District"].strip() for r in rows if r.get("District") and r["District"].strip().lower() != "total"}
    )


def get_hotspots(state: str | None, crime_column: str, top_n: int = 10) -> list[dict]:
    rows = load_rows()
    if crime_column not in CRIME_COLUMNS:
        crime_column = CRIME_COLUMNS[0]
    if state:
        rows = [r for r in rows if r["States/UTs"].strip().lower() == state.strip().lower()]

    scored = []
    for r in rows:
        district = r.get("District", "").strip()
        if not district or district.lower() == "total":
            continue
        try:
            value = int(float(r.get(crime_column, 0) or 0))
        except ValueError:
            value = 0
        if value <= 0:
            continue
        scored.append(
            {
                "state": r["States/UTs"].strip(),
                "district": r["District"].strip(),
                "year": r.get("Year", "").strip(),
                "crime_type": crime_column,
                "count": value,
            }
        )
    scored.sort(key=lambda x: x["count"], reverse=True)
    return scored[:top_n]
