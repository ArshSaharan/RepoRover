# Repo-Rover

Repo-Rover helps developers find open-source projects and contribution opportunities that fit their skills and interests. It combines a web application for GitHub-based discovery and contribution tracking with a FastAPI backend for account, profile, repository, and AI-assisted project information.

## Features

- Sign in with GitHub or email and connect a GitHub account.
- Discover repositories and review AI-assisted recommendations and repository insights.
- Save repositories, explore contribution targets, and track recent contributions.
- Manage a developer profile and preferences.

## Project structure

- `frontend/` — Angular application.
- `backend/` — FastAPI API with Firebase authentication and Firestore integration.

## Requirements

- Node.js and npm
- Python 3.11 or newer
- A Firebase service account for the backend
- GitHub OAuth credentials
- A Gemini API key for AI-assisted features

## Run the frontend

```bash
cd frontend
npm install
npm start
```

The Angular development server runs at `http://localhost:4200` by default.

## Run the backend

Create `backend/.env` with the credentials and local settings below. Keep secrets out of source control.

```dotenv
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret
GITHUB_REDIRECT_URI=http://localhost:8000/auth/github/callback
FIREBASE_SERVICE_ACCOUNT_PATH=serviceAccountKey.json
FRONTEND_URL=http://localhost:4200
GEMINI_API_KEY=your-gemini-api-key
SECRET_KEY=replace-with-a-random-secret
```

Place the Firebase service account JSON at the configured path (by default `backend/serviceAccountKey.json`). Then run:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install .
uvicorn main:app --reload
```

The API runs at `http://localhost:8000`; interactive API documentation is available at `http://localhost:8000/docs`.

## Configuration

The frontend API URL and Firebase client configuration are defined in the Angular application configuration. Set these values for your own Firebase project and backend deployment before using the application.

## License

No license file is currently included. All rights are reserved unless a license is added to this repository.
