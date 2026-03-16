from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
import os

from routers.auth import verify_firebase_token

router = APIRouter(prefix="/users/me/llm-profile", tags=["LLM Profile"])

class MarkdownProfileUpdate(BaseModel):
    content: str

@router.get("/")
async def get_llm_profile(decoded: dict = Depends(verify_firebase_token)):
    """Fetch the user's generated Markdown profile for LLM context."""
    from firebase_admin import firestore
    db = firestore.client()
    uid = decoded["uid"]
    
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    user_data = doc.to_dict()
    github_username = user_data.get("github_username")
    
    if not github_username:
        raise HTTPException(status_code=400, detail="No GitHub account linked")
        
    md_path = f"data/llm_profiles/{github_username}.md"
    
    if not os.path.exists(md_path):
        return {"content": f"# Developer Profile: {user_data.get('display_name')}\n\nNo underlying GitHub data was found or fetched."}
        
    with open(md_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    return {"content": content}


@router.put("/")
async def update_llm_profile(data: MarkdownProfileUpdate, decoded: dict = Depends(verify_firebase_token)):
    """Overwrite the user's generated Markdown profile."""
    from firebase_admin import firestore
    db = firestore.client()
    uid = decoded["uid"]
    
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")
        
    user_data = doc.to_dict()
    github_username = user_data.get("github_username")
    
    if not github_username:
        raise HTTPException(status_code=400, detail="No GitHub account linked")
        
    os.makedirs("data/llm_profiles", exist_ok=True)
    md_path = f"data/llm_profiles/{github_username}.md"
    
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(data.content)
        
    return {"message": "Profile updated successfully"}
