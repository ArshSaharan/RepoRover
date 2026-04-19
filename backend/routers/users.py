from fastapi import APIRouter, HTTPException, Depends
from firebase_admin import firestore, auth as firebase_auth
from datetime import datetime, timezone

from models import UserProfile, UserUpdate, SavedRepo, SavedReposResponse
from routers.auth import verify_firebase_token

router = APIRouter(prefix="/users", tags=["Users"])

db = firestore.client()


def _parse_saved_repos(raw_repos: list[dict]) -> list[SavedRepo]:
    parsed: list[SavedRepo] = []
    for item in raw_repos:
        if not isinstance(item, dict):
            continue
        try:
            parsed.append(SavedRepo(**item))
        except Exception:
            continue

    return sorted(parsed, key=lambda repo: repo.saved_at or "", reverse=True)


def _normalize_saved_repo_input(repo: SavedRepo, saved_at: str) -> dict:
    payload = repo.model_dump(mode="json")
    payload["saved_at"] = saved_at
    payload["description"] = payload.get("description") or ""
    payload["tags"] = [tag for tag in payload.get("tags", []) if isinstance(tag, str)][:6]
    return payload


@router.get("/me", response_model=UserProfile)
async def get_my_profile(decoded: dict = Depends(verify_firebase_token)):
    """Get the authenticated user's full profile."""
    uid = decoded["uid"]
    doc = db.collection("users").document(uid).get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")

    return UserProfile(**doc.to_dict())


@router.put("/me", response_model=UserProfile)
async def update_my_profile(
    data: UserUpdate,
    decoded: dict = Depends(verify_firebase_token),
):
    """Update the authenticated user's profile."""
    uid = decoded["uid"]
    user_ref = db.collection("users").document(uid)
    doc = user_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")

    update_data = data.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    update_data["updated_at"] = datetime.now(timezone.utc).isoformat()

    # If this is an onboarding completion, mark user as not new
    if "display_name" in update_data:
        update_data["is_new_user"] = False

    user_ref.update(update_data)

    updated_doc = user_ref.get()
    return UserProfile(**updated_doc.to_dict())


@router.get("/me/saved-repos", response_model=SavedReposResponse)
async def get_saved_repos(decoded: dict = Depends(verify_firebase_token)):
    """List authenticated user's saved repositories."""
    uid = decoded["uid"]
    doc = db.collection("users").document(uid).get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")

    user_data = doc.to_dict() or {}
    saved_repos = user_data.get("saved_repos", []) or []
    return SavedReposResponse(repos=_parse_saved_repos(saved_repos))


@router.post("/me/saved-repos", response_model=SavedReposResponse)
async def save_repo(
    repo: SavedRepo,
    decoded: dict = Depends(verify_firebase_token),
):
    """Save or update a repository in the authenticated user's saved list."""
    uid = decoded["uid"]
    user_ref = db.collection("users").document(uid)
    doc = user_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")

    now = datetime.now(timezone.utc).isoformat()
    current = (doc.to_dict() or {}).get("saved_repos", []) or []
    normalized_repo = _normalize_saved_repo_input(repo, now)

    filtered = [
        item for item in current
        if int((item or {}).get("id", -1)) != normalized_repo["id"]
    ]
    filtered.insert(0, normalized_repo)
    capped = filtered[:80]

    user_ref.update({
        "saved_repos": capped,
        "updated_at": now,
    })

    return SavedReposResponse(repos=_parse_saved_repos(capped))


@router.delete("/me/saved-repos/{repo_id}", response_model=SavedReposResponse)
async def remove_saved_repo(
    repo_id: int,
    decoded: dict = Depends(verify_firebase_token),
):
    """Remove one repository from the authenticated user's saved list."""
    uid = decoded["uid"]
    user_ref = db.collection("users").document(uid)
    doc = user_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")

    now = datetime.now(timezone.utc).isoformat()
    current = (doc.to_dict() or {}).get("saved_repos", []) or []
    filtered = [item for item in current if int((item or {}).get("id", -1)) != repo_id]

    user_ref.update({
        "saved_repos": filtered,
        "updated_at": now,
    })

    return SavedReposResponse(repos=_parse_saved_repos(filtered))


@router.get("/{uid}", response_model=UserProfile)
async def get_public_profile(uid: str):
    """Get a user's public profile by UID."""
    doc = db.collection("users").document(uid).get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="User not found")

    user_data = doc.to_dict()

    # Return public-safe subset (exclude sensitive fields)
    return UserProfile(
        uid=user_data.get("uid", uid),
        display_name=user_data.get("display_name"),
        avatar_url=user_data.get("avatar_url"),
        github_username=user_data.get("github_username"),
        provider=user_data.get("provider", "email"),
        skills=user_data.get("skills", []),
        interests=user_data.get("interests", []),
        bio=user_data.get("bio"),
    )
