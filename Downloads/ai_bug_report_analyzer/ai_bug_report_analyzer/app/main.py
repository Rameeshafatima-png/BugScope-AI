
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles

from app.config import GEMINI_API_KEY, GEMINI_MODEL
from app.schemas import BugRequest, BugReport
from app.graph import analyze_bug

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
INDEX_FILE = STATIC_DIR / "index.html"

# Verify frontend files exist before starting the application.
for filename in ("index.html", "styles.css", "app.js"):
    file_path = STATIC_DIR / filename
    if not file_path.is_file():
        raise RuntimeError(f"Missing frontend file: {file_path}")

app = FastAPI(
    title="BugScope AI",
    version="1.0.0",
    description="AI Bug Report Analyzer powered by Gemini and LangGraph",
)

# Serve frontend CSS and JavaScript.
app.mount(
    "/static",
    StaticFiles(directory=str(STATIC_DIR)),
    name="static",
)


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def home():
    return HTMLResponse(
        INDEX_FILE.read_text(encoding="utf-8")
    )


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "app": "BugScope AI",
        "gemini_configured": bool(GEMINI_API_KEY),
        "model": GEMINI_MODEL,
    }


@app.post("/api/analyze", response_model=BugReport)
def analyze(request: BugRequest):
    description = request.description.strip()

    if len(description) < 10:
        raise HTTPException(
            status_code=422,
            detail="Please enter at least 10 characters describing the bug.",
        )

    try:
        return analyze_bug(description)

    except (RuntimeError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail=str(exc),
        ) from exc

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(exc)[:220]}",
        ) from exc
