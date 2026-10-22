import json
import re
from typing import TypedDict, Any
from langgraph.graph import StateGraph, END
from google import genai
from google.genai import types
from app.config import GEMINI_API_KEY, GEMINI_MODEL
from functools import lru_cache

class BugState(TypedDict, total=False):
    description: str
    analysis: dict[str, Any]
    severity: dict[str, Any]
    root_causes: dict[str, Any]
    report: dict[str, Any]


@lru_cache(maxsize=1)
def _client():
    if not GEMINI_API_KEY:
        raise RuntimeError(
            "GEMINI_API_KEY is missing. "
            "Add it to your .env file and restart the server."
        )

    from google import genai

    return genai.Client(api_key=GEMINI_API_KEY)


def _json_from_response(text: str) -> dict:
    cleaned = text.strip()
    cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.I)
    cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        match = re.search(r"\{.*\}", cleaned, re.S)
        if not match:
            raise ValueError("Gemini returned an unreadable response. Please try again.") from exc
        data = json.loads(match.group(0))
    if not isinstance(data, dict):
        raise ValueError("Gemini response was not a JSON object. Please try again.")
    return data

def _ask(prompt: str) -> dict:
    try:
        response = _client().models.generate_content(
            model=GEMINI_MODEL,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.2,
            ),
        )
        if not response.text:
            raise ValueError("Gemini returned an empty response. Please try again.")
        return _json_from_response(response.text)
    except Exception as exc:
        message = str(exc)
        if "API_KEY_INVALID" in message or "API key not valid" in message:
            raise RuntimeError("Gemini API key is invalid. Check GEMINI_API_KEY in your .env file.") from exc
        if "429" in message or "RESOURCE_EXHAUSTED" in message:
            raise RuntimeError("Gemini rate limit or quota reached. Wait a little and try again.") from exc
        if "404" in message or "NOT_FOUND" in message:
            raise RuntimeError(f"Gemini model '{GEMINI_MODEL}' was not found or is unavailable for this API key. Check GEMINI_MODEL in .env.") from exc
        if isinstance(exc, (RuntimeError, ValueError)):
            raise
        raise RuntimeError(f"Gemini request failed: {message[:240]}") from exc

def bug_analysis_node(state: BugState) -> BugState:
    data = _ask(f"""
You are a careful software QA analyst. Analyze this user-provided bug report.
Return JSON only with keys: title, affected_feature, summary, expected_behavior, actual_behavior, reproduction_steps.
Use concise plain language. If details are missing, say "Not specified" rather than inventing them.
reproduction_steps must be an array of strings.
Bug description:
{state['description']}
""")
    data.setdefault("title", "Unspecified software bug")
    data.setdefault("affected_feature", "Not specified")
    data.setdefault("summary", "The reported behavior needs investigation.")
    data.setdefault("expected_behavior", "Not specified")
    data.setdefault("actual_behavior", "Not specified")
    data.setdefault("reproduction_steps", ["Reproduction steps were not provided."])
    return {"analysis": data}

def severity_node(state: BugState) -> BugState:
    data = _ask(f"""
Classify the severity of this software bug using exactly one of Critical, High, Medium, Low.
Base severity on user impact, scope, data/security risk, and availability. Do not exaggerate.
Return JSON with keys severity and severity_reason. The severity field must be one of the four exact labels.
Bug analysis:
{json.dumps(state.get('analysis', {}), ensure_ascii=False)}
Original description:
{state['description']}
""")
    allowed = {"Critical", "High", "Medium", "Low"}
    severity = data.get("severity", "Medium")
    if severity not in allowed:
        severity = "Medium"
    return {"severity": {"severity": severity, "severity_reason": str(data.get("severity_reason", "Severity is an initial AI estimate and should be confirmed by QA."))}}

def root_cause_node(state: BugState) -> BugState:
    data = _ask(f"""
You are a senior software debugging assistant. Suggest plausible causes and practical next steps.
Do not claim certainty or invent code details. Return JSON with keys possible_root_causes (array of 3-5 strings) and recommended_fixes (array of 3-5 strings).
Analysis: {json.dumps(state.get('analysis', {}), ensure_ascii=False)}
Severity: {json.dumps(state.get('severity', {}), ensure_ascii=False)}
Original bug description: {state['description']}
""")
    causes = data.get("possible_root_causes", [])
    fixes = data.get("recommended_fixes", [])
    if not isinstance(causes, list) or not causes:
        causes = ["Insufficient technical detail to identify a likely cause; inspect application logs and reproduce the issue."]
    if not isinstance(fixes, list) or not fixes:
        fixes = ["Reproduce the issue in a test environment, inspect logs, and add a regression test once fixed."]
    return {"root_causes": {"possible_root_causes": causes, "recommended_fixes": fixes}}

def format_report_node(state: BugState) -> BugState:
    a = state.get("analysis", {})
    s = state.get("severity", {})
    r = state.get("root_causes", {})
    title = str(a.get("title", "Unspecified software bug"))
    feature = str(a.get("affected_feature", "Not specified"))
    summary = str(a.get("summary", "Not specified"))
    severity = s.get("severity", "Medium")
    severity_reason = str(s.get("severity_reason", "AI estimate; confirm with the QA team."))
    causes = r.get("possible_root_causes", [])
    fixes = r.get("recommended_fixes", [])
    steps = a.get("reproduction_steps", ["Reproduction steps were not provided."])
    expected = str(a.get("expected_behavior", "Not specified"))
    actual = str(a.get("actual_behavior", "Not specified"))
    md = f"""# {title}

- **Affected feature:** {feature}
- **Severity:** {severity}

## Summary
{summary}

## Severity rationale
{severity_reason}

## Steps to reproduce
{chr(10).join(f"{i}. {step}" for i, step in enumerate(steps, 1)) if steps else "Not specified"}

## Expected behavior
{expected}

## Actual behavior
{actual}

## Possible root causes
{chr(10).join(f"- {item}" for item in causes)}

## Recommended fixes / investigation
{chr(10).join(f"- {item}" for item in fixes)}

---
*Generated by BugWise AI. AI suggestions are hypotheses; verify them against logs, code, and reproduction results.*
"""
    return {"report": {
        "title": title, "affected_feature": feature, "summary": summary,
        "severity": severity, "severity_reason": severity_reason,
        "possible_root_causes": causes, "recommended_fixes": fixes,
        "reproduction_steps": steps, "expected_behavior": expected,
        "actual_behavior": actual, "report_markdown": md,
    }}

def build_bug_graph():
    workflow = StateGraph(BugState)
    workflow.add_node("bug_analysis", bug_analysis_node)
    workflow.add_node("severity_detection", severity_node)
    workflow.add_node("root_cause_suggestion", root_cause_node)
    workflow.add_node("format_report", format_report_node)
    workflow.set_entry_point("bug_analysis")
    workflow.add_edge("bug_analysis", "severity_detection")
    workflow.add_edge("severity_detection", "root_cause_suggestion")
    workflow.add_edge("root_cause_suggestion", "format_report")
    workflow.add_edge("format_report", END)
    return workflow.compile()

bug_graph = build_bug_graph()

def analyze_bug(description: str) -> dict:
    result = bug_graph.invoke({"description": description})
    return result["report"]
