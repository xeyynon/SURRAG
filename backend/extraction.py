"""
Entity extraction: tries Groq (LLM) first if GROQ_API_KEY is set, falls back
to spaCy NER + regex for structured fields (phones, vehicles). This keeps the
demo working with zero API key / zero internet as a safety net.
"""
import os
import re
import json
import spacy
from dateutil import parser as date_parser
from dotenv import load_dotenv

load_dotenv()

_nlp = None


def get_nlp():
    global _nlp
    if _nlp is None:
        _nlp = spacy.load("en_core_web_sm")
    return _nlp


PHONE_RE = re.compile(r"\b[6-9]\d{9}\b")
VEHICLE_RE = re.compile(r"\b[A-Z]{2}\d{2}[A-Z]{1,2}\d{4}\b")

# en_core_web_sm frequently mislabels Indian place names and vehicle model
# names as PERSON. For this controlled demo dataset, a small gazetteer fixes
# the misclassification without needing a fine-tuned NER model.
KNOWN_LOCATIONS = {
    "nagpur", "gandhi nagar", "sadar", "sadar checkpoint",
    "gandhi nagar market", "plot 14, gandhi nagar", "plot 14",
}
KNOWN_NON_PERSONS = {
    "maruti swift", "bajaj pulsar",
}
TITLE_PREFIXES = re.compile(
    r"^(victim|driver|complainant|accused|witness|suspect|passenger)\s+",
    re.IGNORECASE,
)
BARE_TITLES = {"complainant", "victim", "driver", "accused", "witness", "suspect"}


def clean_person_name(name: str) -> str | None:
    cleaned = TITLE_PREFIXES.sub("", name).strip()
    cleaned = re.sub(r"'s$", "", cleaned).strip()
    if not cleaned or cleaned.lower() in BARE_TITLES:
        return None
    return cleaned


def extract_regex_entities(text: str) -> dict:
    return {
        "phones": sorted(set(PHONE_RE.findall(text))),
        "vehicles": sorted(set(VEHICLE_RE.findall(text))),
    }


# Relative/vague date phrases dateutil would otherwise "successfully" parse
# against today's date, producing a fabricated occurrence date.
_VAGUE_DATE_WORDS = {"today", "yesterday", "tomorrow", "tonight", "now"}


def parse_occurrence_date(date_texts: list[str]) -> str | None:
    """Best-effort: try each candidate DATE span, return the first one that
    parses to a real, plausible (1990-2035) calendar date. Returns ISO
    (YYYY-MM-DD) or None — most narrative text has no explicit date at all,
    and that's an honest None, not a guess."""
    for candidate in date_texts:
        low = candidate.strip().lower()
        if not low or low in _VAGUE_DATE_WORDS or low.isdigit():
            continue
        try:
            parsed = date_parser.parse(candidate, fuzzy=True, dayfirst=True)
        except (date_parser.ParserError, ValueError, OverflowError):
            continue
        if 1990 <= parsed.year <= 2035:
            return parsed.date().isoformat()
    return None


def extract_occurrence_date_spacy(doc) -> str | None:
    date_spans = [ent.text for ent in doc.ents if ent.label_ == "DATE"]
    return parse_occurrence_date(date_spans)


def extract_with_spacy(text: str) -> dict:
    nlp = get_nlp()
    doc = nlp(text)
    raw_persons = {ent.text.strip() for ent in doc.ents if ent.label_ == "PERSON"}
    locations = {ent.text.strip() for ent in doc.ents if ent.label_ in ("GPE", "LOC", "FAC")}

    persons = set()
    for p in raw_persons:
        low = p.lower()
        if low in KNOWN_LOCATIONS:
            locations.add(p)
            continue
        if low in KNOWN_NON_PERSONS:
            continue
        cleaned = clean_person_name(p)
        if cleaned:
            persons.add(cleaned)

    structured = extract_regex_entities(text)
    return {
        "persons": sorted(persons),
        "locations": sorted(locations),
        "phones": structured["phones"],
        "vehicles": structured["vehicles"],
        "occurred_on": extract_occurrence_date_spacy(doc),
        "source": "spacy+regex",
    }


GROQ_PROMPT = """Extract structured entities from this Indian FIR (First Information Report) narrative.
Return ONLY valid JSON, no prose, in this exact shape:
{{"persons": ["..."], "locations": ["..."], "phones": ["..."], "vehicles": ["..."], "occurred_on": "YYYY-MM-DD or null"}}

Rules:
- persons: full names of individuals mentioned (accused, victims, witnesses, aliases)
- locations: place names, addresses, landmarks
- phones: phone numbers exactly as written
- vehicles: vehicle registration numbers exactly as written
- occurred_on: the date the incident occurred, ONLY if explicitly stated in the text
  (e.g. "on 12 June 2026" or "on 14/07/2026"). Use null if no explicit date is given —
  never guess or infer a date from context.

Narrative:
{text}
"""


def extract_with_groq(text: str) -> dict | None:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return None
    try:
        from groq import Groq

        client = Groq(api_key=api_key)
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": GROQ_PROMPT.format(text=text)}],
            temperature=0,
            max_tokens=512,
        )
        content = resp.choices[0].message.content.strip()
        content = re.sub(r"^```(json)?|```$", "", content, flags=re.MULTILINE).strip()
        data = json.loads(content)
        data["persons"] = sorted(
            {c for p in data.get("persons", []) if (c := clean_person_name(p))}
        )
        # backstop structured fields with regex in case the LLM misses formatting
        structured = extract_regex_entities(text)
        data.setdefault("phones", [])
        data.setdefault("vehicles", [])
        data["phones"] = sorted(set(data["phones"]) | set(structured["phones"]))
        data["vehicles"] = sorted(set(data["vehicles"]) | set(structured["vehicles"]))
        occurred_on = data.get("occurred_on")
        data["occurred_on"] = parse_occurrence_date([occurred_on]) if occurred_on else None
        data["source"] = "groq"
        return data
    except Exception:
        return None


def extract_entities(text: str) -> dict:
    result = extract_with_groq(text)
    if result is not None:
        return result
    return extract_with_spacy(text)
