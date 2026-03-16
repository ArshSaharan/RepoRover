from fastapi import APIRouter, HTTPException, Depends
from firebase_admin import firestore, auth as firebase_auth
from datetime import datetime, timezone

from models import UserProfile, UserUpdate
from routers.auth import verify_firebase_token

router = APIRouter(prefix="/users", tags=["Users"])

db = firestore.client()


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
