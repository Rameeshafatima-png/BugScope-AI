# BugWise AI — AI Bug Report Analyzer

BugWise AI is a web application that turns a natural-language software bug description into a structured, actionable bug report. It uses Google's Gemini model for language understanding and LangGraph to orchestrate a four-node analysis workflow.

## Features

- Bug title, affected feature, and concise issue summary
- Severity classification: Critical, High, Medium, or Low
- Severity rationale based on likely user impact
- Possible root causes and recommended investigation/fixes
- Reproduction steps and expected-versus-actual behavior
- Responsive blue dashboard with sample prompts, animated loading states, and optional dark mode
- Copy report and download as Markdown
- FastAPI endpoint and interactive Swagger documentation
- Input validation and readable API-key, quota, and model errors

## Workflow

1. **Bug Analysis** — Extracts the title, feature, summary, reproduction steps, expected behavior, and actual behavior.
2. **Severity Detection** — Assigns a severity label and explains the reasoning.
3. **Root Cause Suggestion** — Suggests plausible causes and practical investigation steps.
4. **Format Report** — Produces a consistent Markdown report and structured JSON response.

The graph is defined in `app/graph.py` with LangGraph `StateGraph` and sequential edges. Each analysis node calls Gemini; results flow through the shared graph state.

## Requirements

- Python 3.10 or newer
- A Google Gemini API key
- Internet access for Gemini API calls

## Setup on Windows (PowerShell)

### 1. Extract and open the project

```powershell
cd ai_bug_report_analyzer
```

### 2. Create and activate a virtual environment

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
```

If PowerShell blocks activation for this terminal, you can run:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\.venv\Scripts\Activate.ps1
```

### 3. Install dependencies

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

### 4. Configure Gemini

Copy the example environment file:

```powershell
Copy-Item .env.example .env
```

Open `.env` and replace `your_gemini_api_key_here` with your key. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).

```dotenv
GEMINI_API_KEY=your_real_api_key
GEMINI_MODEL=gemini-2.5-flash
```

Keep `.env` private. It is ignored by Git; never commit your API key.

### 5. Run the app

```powershell
uvicorn app.main:app --reload
```

Open:

- Web app: http://127.0.0.1:8000
- Swagger API docs: http://127.0.0.1:8000/docs
- Health check: http://127.0.0.1:8000/api/health

## API

### `POST /api/analyze`

Request:

```json
{
  "description": "Users are logged out immediately after signing in. The session cookie does not persist in Safari."
}
```

The response contains `title`, `affected_feature`, `summary`, `severity`, `severity_reason`, `possible_root_causes`, `recommended_fixes`, `reproduction_steps`, `expected_behavior`, `actual_behavior`, and `report_markdown`.

### `GET /api/health`

Returns application status, whether the Gemini key is configured, and the selected model name. It never returns the API key.

## Troubleshooting

- **`GEMINI_API_KEY is missing`**: Ensure `.env` is in the project root beside `requirements.txt`, then restart Uvicorn.
- **Invalid API key**: Create/check your key in Google AI Studio and ensure `.env` has no extra quotes or spaces around the value.
- **Quota / rate limit**: Wait and retry; review quota and billing availability for your Gemini project.
- **Model not found**: Set `GEMINI_MODEL` to a model currently available to your API key.
- **Port in use**: Run `uvicorn app.main:app --reload --port 8001` and visit port 8001.

## Project structure

```text
ai_bug_report_analyzer/
├── app/
│   ├── __init__.py
│   ├── config.py
│   ├── graph.py
│   ├── main.py
│   ├── schemas.py
│   └── static/
│       ├── index.html
│       ├── styles.css
│       └── app.js
├── .env.example
├── .gitignore
├── requirements.txt
└── README.md
```

## GitHub

Create an empty GitHub repository, then run these commands from the project folder:

```powershell
git init
git add .
git commit -m "Build AI Bug Report Analyzer with Gemini and LangGraph"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/ai-bug-report-analyzer.git
git push -u origin main
```

Replace the remote URL with your own repository URL. Confirm `.env` is not staged before pushing.

## Important note

Severity, root causes, and fixes are AI-generated suggestions, not verified facts. Confirm them by reproducing the issue and reviewing source code, logs, and tests before acting on them.

## License

Choose a license that matches how you intend to share and reuse this project.
