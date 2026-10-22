
"use strict";

const $ = (id) => document.getElementById(id);

const descriptionEl = $("bugDescription");
const charCount = $("charCount");
const analyzeBtn = $("analyzeBtn");
const errorBox = $("errorBox");
const emptyState = $("emptyState");
const loadingState = $("loadingState");
const loadingMessage = $("loadingMessage");
const reportContent = $("reportContent");
const copyBtn = $("copyBtn");
const themeToggle = $("themeToggle");
const toast = $("toast");

const MAX_CHARS = 12000;
const LOADING_MESSAGES = [
  "Analyzing the reported issue...",
  "Assessing user impact and severity...",
  "Exploring possible root causes...",
  "Formatting your structured report..."
];

let currentReport = null;
let loadingTimer = null;
let toastTimer = null;

function applyTheme(theme) {
  const light = theme === "light";
  document.body.classList.toggle("light", light);
  themeToggle.textContent = light ? "☾" : "☀";
  themeToggle.setAttribute("aria-label", light ? "Switch to dark theme" : "Switch to light theme");

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = light ? "#edf1ef" : "#0c1725";
}

let savedTheme = "dark";
try {
  savedTheme = localStorage.getItem("bugscope-theme") ||
    localStorage.getItem("theme") || "dark";
} catch (_) {}

applyTheme(savedTheme);

themeToggle.addEventListener("click", () => {
  const next = document.body.classList.contains("light") ? "dark" : "light";
  applyTheme(next);
  try {
    localStorage.setItem("bugscope-theme", next);
    localStorage.setItem("theme", next);
  } catch (_) {}
});

function updateCount() {
  charCount.textContent =
    `${descriptionEl.value.length.toLocaleString()} / ${MAX_CHARS.toLocaleString()}`;
}

descriptionEl.addEventListener("input", updateCount);

document.querySelectorAll(".chip[data-sample]").forEach((button) => {
  button.addEventListener("click", () => {
    descriptionEl.value = button.dataset.sample || "";
    updateCount();
    hideError();
    descriptionEl.focus();
  });
});

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function listHtml(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "<p>Not specified.</p>";
  }
  return `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function showError(message) {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function hideError() {
  errorBox.hidden = true;
  errorBox.textContent = "";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2400);
}

function setLoading(active) {
  analyzeBtn.disabled = active;
  analyzeBtn.querySelector(".btn-label").textContent =
    active ? "Analyzing..." : "✦  Analyze bug  →";
  analyzeBtn.querySelector(".btn-spinner").hidden = !active;
  loadingState.hidden = !active;

  if (active) {
    emptyState.hidden = true;
    reportContent.hidden = true;

    let index = 0;
    updateLoadingStep(index);
    clearInterval(loadingTimer);

    loadingTimer = setInterval(() => {
      index = Math.min(index + 1, LOADING_MESSAGES.length - 1);
      updateLoadingStep(index);
    }, 2300);
  } else {
    clearInterval(loadingTimer);
    loadingTimer = null;
  }
}

function updateLoadingStep(index) {
  loadingMessage.textContent = LOADING_MESSAGES[index];

  document.querySelectorAll(".step").forEach((step, stepIndex) => {
    step.classList.toggle("active", stepIndex === index);
  });
}

function reportToMarkdown(report) {
  if (typeof report.report_markdown === "string" && report.report_markdown.trim()) {
    return report.report_markdown;
  }

  const lines = [
    `# ${report.title || "Bug Analysis Report"}`,
    "",
    `**Severity:** ${report.severity || "Not specified"}`,
    `**Affected feature:** ${report.affected_feature || "Not specified"}`,
    "",
    "## Summary",
    report.summary || "Not specified",
    "",
    "## Severity rationale",
    report.severity_reason || "Not specified",
    "",
    "## Reproduction steps",
    ...(Array.isArray(report.reproduction_steps)
      ? report.reproduction_steps.map((item, i) => `${i + 1}. ${item}`)
      : ["Not specified"]),
    "",
    "## Expected behavior",
    report.expected_behavior || "Not specified",
    "",
    "## Actual behavior",
    report.actual_behavior || "Not specified",
    "",
    "## Possible root causes",
    ...(Array.isArray(report.possible_root_causes)
      ? report.possible_root_causes.map(item => `- ${item}`)
      : ["- Not specified"]),
    "",
    "## Recommended fixes",
    ...(Array.isArray(report.recommended_fixes)
      ? report.recommended_fixes.map(item => `- ${item}`)
      : ["- Not specified"]),
    "",
    "> AI-generated hypotheses. Verify against code, logs, and tests."
  ];

  return lines.join("\n");
}

function renderReport(report) {
  const rawSeverity = String(report.severity || "Medium");
  const severity = ["critical", "high", "medium", "low"].includes(rawSeverity.toLowerCase())
    ? rawSeverity.toLowerCase()
    : "medium";

  const title = report.title || "Bug analysis report";
  const feature = report.affected_feature || "Not specified";
  const summary = report.summary || "No summary provided.";
  const reason = report.severity_reason || "AI-generated estimate based on the reported impact.";
  const expected = report.expected_behavior || "Not specified.";
  const actual = report.actual_behavior || summary;

  reportContent.innerHTML = `
    <div class="report-head">
      <span class="severity sev-${severity}">${escapeHtml(rawSeverity)} severity</span>
      <span class="feature-tag">${escapeHtml(feature)}</span>
    </div>

    <h3 class="report-title">${escapeHtml(title)}</h3>
    <p class="report-summary">${escapeHtml(summary)}</p>

    <div class="block">
      <h4>Severity rationale</h4>
      <p>${escapeHtml(reason)}</p>
    </div>

    <div class="block">
      <h4>Reproduction steps</h4>
      ${listHtml(report.reproduction_steps)}
    </div>

    <div class="two-col">
      <div class="block">
        <h4>Expected behavior</h4>
        <p class="expected">${escapeHtml(expected)}</p>
      </div>
      <div class="block">
        <h4>Actual behavior</h4>
        <p class="actual">${escapeHtml(actual)}</p>
      </div>
    </div>

    <div class="block">
      <h4>Possible root causes</h4>
      ${listHtml(report.possible_root_causes)}
    </div>

    <div class="block">
      <h4>Recommended fixes</h4>
      ${listHtml(report.recommended_fixes)}
    </div>

    <div class="disclaimer-note">
      AI-generated hypotheses, not confirmed diagnoses. Verify against code, logs, and tests.
    </div>

    <div class="report-actions">
      <button id="downloadBtn" type="button">↓ Download Markdown</button>
      <button id="resetBtn" type="button">↻ New analysis</button>
    </div>
  `;

  reportContent.hidden = false;
  emptyState.hidden = true;
  copyBtn.disabled = false;

  $("downloadBtn").addEventListener("click", downloadReport);
  $("resetBtn").addEventListener("click", resetOutput);
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const helper = document.createElement("textarea");
  helper.value = text;
  helper.style.position = "fixed";
  helper.style.left = "-9999px";
  document.body.appendChild(helper);
  helper.select();

  const success = document.execCommand("copy");
  helper.remove();

  if (!success) {
    throw new Error("Clipboard is unavailable. Try Download Markdown instead.");
  }
}

copyBtn.addEventListener("click", async () => {
  if (!currentReport) return;

  try {
    await copyText(reportToMarkdown(currentReport));
    copyBtn.textContent = "Copied ✓";
    showToast("Report copied successfully");

    setTimeout(() => {
      copyBtn.textContent = "Copy report";
    }, 1800);
  } catch (error) {
    showError(error.message || "Unable to copy the report.");
  }
});

function downloadReport() {
  if (!currentReport) return;

  const blob = new Blob(
    [reportToMarkdown(currentReport)],
    { type: "text/markdown;charset=utf-8" }
  );

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "bugscope-report.md";
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("Markdown report downloaded");
}

function resetOutput() {
  currentReport = null;
  reportContent.hidden = true;
  emptyState.hidden = false;
  copyBtn.disabled = true;
  copyBtn.textContent = "Copy report";
  hideError();
  descriptionEl.focus();
}

analyzeBtn.addEventListener("click", async () => {
  const description = descriptionEl.value.trim();
  hideError();

  if (description.length < 10) {
    showError("Please enter at least 10 characters describing the bug.");
    descriptionEl.focus();
    return;
  }

  if (description.length > MAX_CHARS) {
    showError(`Please keep the description under ${MAX_CHARS.toLocaleString()} characters.`);
    return;
  }

  currentReport = null;
  copyBtn.disabled = true;
  setLoading(true);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000);

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify({ description }),
      signal: controller.signal
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const detail = typeof data.detail === "string"
        ? data.detail
        : "Analysis failed. Check the server terminal and Gemini configuration.";
      throw new Error(detail);
    }

    if (!data || typeof data !== "object" || !data.title) {
      throw new Error("Unexpected API response. Check the response schema in app/schemas.py.");
    }

    currentReport = data;
    renderReport(data);
    showToast("Bug report generated");
    reportContent.scrollIntoView({ behavior: "smooth", block: "nearest" });

  } catch (error) {
    if (error.name === "AbortError") {
      showError("The request timed out. Check your Gemini API key, model, and server logs.");
    } else if (error instanceof TypeError) {
      showError("Cannot connect to FastAPI. Make sure the server is running at http://127.0.0.1:8000.");
    } else {
      showError(error.message || "Something went wrong. Please try again.");
    }

    emptyState.hidden = false;
  } finally {
    clearTimeout(timeoutId);
    setLoading(false);
  }
});

updateCount();
