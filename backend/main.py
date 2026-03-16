import firebase_admin
from firebase_admin import credentials
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings

# ─── Firebase Admin SDK Init ────────────────────────────────────
# MUST happen before importing routers, because they call firestore.client()
cred = credentials.Certificate(settings.FIREBASE_SERVICE_ACCOUNT_PATH)
firebase_admin.initialize_app(cred)

# ─── Import routers AFTER Firebase init ─────────────────────────
from routers import auth, users, profiles  # noqa: E402

# ─── FastAPI App ─────────────────────────────────────────────────
app = FastAPI(
    title="Repo-Rover API",
    description="Backend API for Repo-Rover — AI-powered open-source matching engine",
    version="1.0.0",
)

# ─── CORS ────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:4200",
        "http://localhost:4201",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ─────────────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(profiles.router)


@app.get("/")
async def root():
    return {
        "app": "Repo-Rover API",
        "version": "1.0.0",
        "status": "running",
        "docs": "/docs",
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
