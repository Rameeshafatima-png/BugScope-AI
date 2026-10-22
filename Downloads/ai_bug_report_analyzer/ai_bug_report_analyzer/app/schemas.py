from typing import Literal
from pydantic import BaseModel, Field

Severity = Literal["Critical", "High", "Medium", "Low"]

class BugRequest(BaseModel):
    description: str = Field(..., min_length=10, max_length=12000, description="Natural-language bug description")

class BugReport(BaseModel):
    title: str
    affected_feature: str
    summary: str
    severity: Severity
    severity_reason: str
    possible_root_causes: list[str]
    recommended_fixes: list[str]
    reproduction_steps: list[str]
    expected_behavior: str
    actual_behavior: str
    report_markdown: str
