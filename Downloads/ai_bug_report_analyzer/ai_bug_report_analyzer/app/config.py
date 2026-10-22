import os
from dotenv import load_dotenv

load_dotenv()

APP_NAME = "BugWise AI"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash").strip()
