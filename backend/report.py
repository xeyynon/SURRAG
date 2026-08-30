"""
LLM-synthesized investigation-lead reports — the piece both use cases in
crimelink-architecture-design.md call for and the prototype previously had
none of: turning raw graph/vector output into a narrative with every claim
cited to a CID/PID. Uses Groq if available (same free-tier model as
extraction.py); falls back to a deterministic templated summary assembled
from the same structured data if no GROQ_API_KEY is set, so the feature
never hard-depends on an API key.
"""
import os
import re
from dotenv import load_dotenv

load_dotenv()


def _fallback_report(case: dict, resolved_persons: list[dict], hidden_connections: list[dict],
                      key_connectors: list[dict], similar_cases: list[dict]) -> str:
    lines = [f"INVESTIGATION LEAD SUMMARY — {case['fir_number']} ({case['cid']})", ""]
    lines.append(f"Crime type: {case['crime_type']}")
    if resolved_persons:
        names = ", ".join(f"{p['name']} ({p['pid']})" for p in resolved_persons)
        lines.append(f"Persons identified: {names}")
    if hidden_connections:
        lines.append("")
        lines.append("Hidden connections surfaced (graph path):")
        for c in hidden_connections[:8]:
            lines.append(f"  - {c['label']} ({c['type']}) — linked via shared entity, ref {c['id']}")
    if key_connectors:
        lines.append("")
        lines.append("Key network connectors (PageRank/betweenness):")
        for k in key_connectors[:5]:
            lines.append(f"  - {k['label']} ({k['type']}) — degree {k['degree']}")
    if similar_cases:
        lines.append("")
        lines.append("Similar prior cases by MO (vector similarity):")
        for s in similar_cases[:5]:
            lines.append(f"  - {s['fir_number']} ({s['cid']}) — {int(s['score']*100)}% similarity, {s['crime_type']}")
    lines.append("")
    lines.append("[Templated summary — set GROQ_API_KEY for narrative synthesis.]")
    return "\n".join(lines)


def synthesize_report(case: dict, resolved_persons: list[dict], hidden_connections: list[dict],
                       key_connectors: list[dict], similar_cases: list[dict]) -> dict:
    api_key = os.environ.get("GROQ_API_KEY")
    fallback = _fallback_report(case, resolved_persons, hidden_connections, key_connectors, similar_cases)

    if not api_key:
        return {"narrative": fallback, "source": "templated"}

    try:
        from groq import Groq

        client = Groq(api_key=api_key)
        prompt = f"""You are assisting a police investigator. Write a short (150-250 word) investigation-lead
summary for the case below. Every factual claim MUST cite the CID or PID it came from in
parentheses, e.g. "Vijay Shinde (PID-ABC123) is linked to two prior extortion cases (CID-XYZ789)."
Do not invent facts not present in the data below.

CASE: {case['fir_number']} ({case['cid']}), crime type: {case['crime_type']}
NARRATIVE: {case['narrative']}

RESOLVED PERSONS: {[(p['name'], p['pid'], 'new' if p['is_new'] else 'existing') for p in resolved_persons]}

HIDDEN CONNECTIONS (graph path — entities linked to this case via shared phone/vehicle/location/person):
{[(c['label'], c['type'], c['id']) for c in hidden_connections]}

KEY NETWORK CONNECTORS (ranked by PageRank/betweenness centrality):
{[(k['label'], k['type'], k['degree']) for k in key_connectors]}

SIMILAR PRIOR CASES (vector similarity on MO/narrative):
{[(s['fir_number'], s['cid'], f"{int(s['score']*100)}%", s['crime_type']) for s in similar_cases]}
"""
        resp = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=500,
        )
        narrative = resp.choices[0].message.content.strip()
        return {"narrative": narrative, "source": "groq-llama-3.3-70b"}
    except Exception:
        return {"narrative": fallback, "source": "templated"}
