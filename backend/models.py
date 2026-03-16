from pydantic import BaseModel, EmailStr
from typing import Optional


class UserSignup(BaseModel):
    email: EmailStr
    password: str
    display_name: Optional[str] = None


class UserRegister(BaseModel):
    """Used after frontend creates user in Firebase Auth — just stores profile."""
    id_token: str
    display_name: Optional[str] = None


class UserLogin(BaseModel):
    id_token: str  # Firebase ID token from frontend


class UserProfile(BaseModel):
    uid: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    github_username: Optional[str] = None
    provider: str = "email"  # "email" or "github"
    skills: list[str] = []
    interests: list[str] = []
    availability: Optional[str] = None
    bio: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    is_new_user: bool = False


class UserUpdate(BaseModel):
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    github_username: Optional[str] = None
    skills: Optional[list[str]] = None
    interests: Optional[list[str]] = None
    availability: Optional[str] = None
    bio: Optional[str] = None


class TokenResponse(BaseModel):
    token: str
    uid: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    is_new_user: bool = False


class GitHubStats(BaseModel):
    username: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    bio: Optional[str] = None
    location: Optional[str] = None
    public_repos: int = 0
    followers: int = 0
    following: int = 0
    total_prs: int = 0
    total_issues: int = 0
    repos: list[dict] = []
