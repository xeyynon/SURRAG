"""
LLM-synthesized investigation-lead reports — the piece both use cases in
crimelink-architecture-design.md call for and the prototype previously had
none of: turning raw graph/vector output into a narrative with every claim
cited to a CID/PID. Three-tier fallback so the feature never hard-depends
on any single service:
  1. Groq (online, best quality) — if GROQ_API_KEY is set
  2. Ollama (offline, local model) — if an Ollama server is reachable
  3. Templated summary (zero dependencies) — always works
"""
import os
import urllib.request
import json as json_lib
from dotenv import load_dotenv

load_dotenv()

OLLAMA_HOST = os.environ.get("OLLAMA_HOST", "http://localhost:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")


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
    lines.append("[Templated summary — no LLM available. Set GROQ_API_KEY or run Ollama for narrative synthesis.]")
    return "\n".join(lines)


def _build_prompt(case: dict, resolved_persons: list[dict], hidden_connections: list[dict],
                   key_connectors: list[dict], similar_cases: list[dict]) -> str:
    return f"""You are assisting a police investigator. Write a short (150-250 word) investigation-lead
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


def _synthesize_with_groq(prompt: str) -> str | None:
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        return None
    try:
        from groq import Groq

        client = Groq(api_key=api_key)
        resp = client.chat.completions.create(
            model="openai/gpt-oss-120b",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            max_tokens=1200,
        )
        return resp.choices[0].message.content.strip()
    except Exception:
        return None


def _synthesize_with_ollama(prompt: str) -> str | None:
    """Offline fallback — a local Ollama server (no internet, no API key).
    Silently returns None if Ollama isn't running or the model isn't
    pulled, so this never blocks the request."""
    try:
        payload = json_lib.dumps(
            {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False, "options": {"temperature": 0.2}}
        ).encode("utf-8")
        req = urllib.request.Request(
            f"{OLLAMA_HOST}/api/generate", data=payload, headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json_lib.loads(resp.read().decode("utf-8"))
        text = data.get("response", "").strip()
        return text if text else None
    except Exception:
        return None


def synthesize_report(case: dict, resolved_persons: list[dict], hidden_connections: list[dict],
                       key_connectors: list[dict], similar_cases: list[dict]) -> dict:
    prompt = _build_prompt(case, resolved_persons, hidden_connections, key_connectors, similar_cases)

    narrative = _synthesize_with_groq(prompt)
    if narrative:
        return {"narrative": narrative, "source": "groq-gpt-oss-120b"}

    narrative = _synthesize_with_ollama(prompt)
    if narrative:
        return {"narrative": narrative, "source": f"ollama-{OLLAMA_MODEL}"}

    fallback = _fallback_report(case, resolved_persons, hidden_connections, key_connectors, similar_cases)
    return {"narrative": fallback, "source": "templated"}
