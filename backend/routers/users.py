from fastapi import APIRouter, HTTPException, Depends
from firebase_admin import firestore, auth as firebase_auth
from datetime import datetime, timezone
from uuid import uuid4

from models import (
    UserProfile,
    UserUpdate,
    SavedRepo,
    SavedReposResponse,
    Notification,
    NotificationsResponse,
    ContributionCreate,
    Contribution,
    ContributionsResponse,
)
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


def _normalize_contribution_input(contribution: ContributionCreate, contrib_id: str, created_at: str) -> dict:
    payload = contribution.model_dump(mode="json")
    payload["id"] = contrib_id
    payload["created_at"] = created_at

    payload["title"] = (payload.get("title") or "").strip()
    payload["description"] = (payload.get("description") or "").strip() or None
    payload["category"] = (payload.get("category") or "General").strip() or "General"
    payload["project"] = (payload.get("project") or "").strip() or None
    payload["url"] = (payload.get("url") or "").strip() or None

    tags = [tag.strip() for tag in payload.get("tags", []) if isinstance(tag, str) and tag.strip()]
    payload["tags"] = tags[:8]

    payload["occurred_at"] = payload.get("occurred_at") or created_at
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

    # Trigger a notification
    notif_id = f"notif_{int(datetime.now(timezone.utc).timestamp() * 1000)}"
    user_ref.collection("notifications").document(notif_id).set({
        "id": notif_id,
        "message": f"You successfully saved '{repo.name}' to your bookmarks.",
        "read_status": False,
        "created_at": now
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


@router.get("/me/notifications", response_model=NotificationsResponse)
async def get_notifications(decoded: dict = Depends(verify_firebase_token)):
    """Get the authenticated user's notifications."""
    uid = decoded["uid"]
    notifs = db.collection("users").document(uid).collection("notifications") \
               .order_by("created_at", direction=firestore.Query.DESCENDING).limit(50).stream()

    parsed = []
    for cur in notifs:
        doc_dict = cur.to_dict()
        parsed.append(Notification(
            id=doc_dict.get("id"),
            message=doc_dict.get("message", ""),
            read_status=doc_dict.get("read_status", False),
            created_at=doc_dict.get("created_at", "")
        ))

    return NotificationsResponse(notifications=parsed)


@router.patch("/me/notifications/{notif_id}/read", response_model=Notification)
async def mark_notification_read(
    notif_id: str,
    decoded: dict = Depends(verify_firebase_token),
):
    uid = decoded["uid"]
    notif_ref = db.collection("users").document(uid).collection("notifications").document(notif_id)
    doc = notif_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Notification not found")

    notif_ref.update({"read_status": True})
    
    updated = notif_ref.get().to_dict()
    return Notification(**updated)


@router.get("/me/contributions", response_model=ContributionsResponse)
async def get_contributions(decoded: dict = Depends(verify_firebase_token)):
    """Get the authenticated user's manual contributions."""
    uid = decoded["uid"]
    user_ref = db.collection("users").document(uid)
    doc = user_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")

    contrib_docs = (
        user_ref.collection("contributions")
        .order_by("occurred_at", direction=firestore.Query.DESCENDING)
        .limit(100)
        .stream()
    )

    parsed: list[Contribution] = []
    for cur in contrib_docs:
        data = cur.to_dict() or {}
        try:
            parsed.append(Contribution(**data))
        except Exception:
            continue

    return ContributionsResponse(contributions=parsed)


@router.post("/me/contributions", response_model=Contribution)
async def add_contribution(
    contribution: ContributionCreate,
    decoded: dict = Depends(verify_firebase_token),
):
    """Create a manual contribution entry for the authenticated user."""
    uid = decoded["uid"]
    user_ref = db.collection("users").document(uid)
    doc = user_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")

    if not (contribution.title or "").strip():
        raise HTTPException(status_code=400, detail="Contribution title is required")

    now = datetime.now(timezone.utc).isoformat()
    contrib_id = f"contrib_{uuid4().hex[:12]}"
    payload = _normalize_contribution_input(contribution, contrib_id, now)

    user_ref.collection("contributions").document(contrib_id).set(payload)
    user_ref.update({"updated_at": now})

    return Contribution(**payload)


@router.delete("/me/contributions/{contrib_id}")
async def delete_contribution(
    contrib_id: str,
    decoded: dict = Depends(verify_firebase_token),
):
    """Delete a manual contribution entry for the authenticated user."""
    uid = decoded["uid"]
    user_ref = db.collection("users").document(uid)
    doc = user_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")

    contrib_ref = user_ref.collection("contributions").document(contrib_id)
    contrib_doc = contrib_ref.get()

    if not contrib_doc.exists:
        raise HTTPException(status_code=404, detail="Contribution not found")

    contrib_ref.delete()
    user_ref.update({"updated_at": datetime.now(timezone.utc).isoformat()})

    return {"status": "deleted"}


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
