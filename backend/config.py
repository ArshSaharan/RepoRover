import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    GITHUB_CLIENT_ID: str = os.getenv("GITHUB_CLIENT_ID", "")
    GITHUB_CLIENT_SECRET: str = os.getenv("GITHUB_CLIENT_SECRET", "")
    FIREBASE_SERVICE_ACCOUNT_PATH: str = os.getenv(
        "FIREBASE_SERVICE_ACCOUNT_PATH", "serviceAccountKey.json"
    )
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:4200")
    SECRET_KEY: str = os.getenv("SECRET_KEY", "repo-rover-dev-secret")
    GITHUB_REDIRECT_URI: str = os.getenv(
        "GITHUB_REDIRECT_URI", "http://localhost:8000/auth/github/callback"
    )
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")

settings = Settings()
