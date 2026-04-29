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


class GitHubDiscoveryCategory(BaseModel):
    name: str
    language: str
    meta: str


class GitHubDiscoveryRepo(BaseModel):
    id: int
    name: str
    full_name: str
    owner: str
    description: Optional[str] = None
    language: Optional[str] = None
    stars: int = 0
    open_issues: int = 0
    html_url: str
    tags: list[str] = []
    match_score: int = 0
    difficulty: str = "Medium"


class GitHubTrendingRepo(BaseModel):
    name: str
    full_name: str
    language: Optional[str] = None
    stars: int = 0
    html_url: str
    rank: str


class GitHubDiscoveryResponse(BaseModel):
    focus_area: str
    match_percent: int
    categories: list[GitHubDiscoveryCategory] = []
    repos: list[GitHubDiscoveryRepo] = []
    trending: list[GitHubTrendingRepo] = []


class GitHubContributionDay(BaseModel):
    date: str
    count: int = 0
    level: int = 0


class GitHubContributionWeek(BaseModel):
    first_day: str
    days: list[GitHubContributionDay] = []


class GitHubRecentContribution(BaseModel):
    id: int
    repo: str
    title: str
    status: str
    url: str
    occurred_at: str
    additions: int = 0
    deletions: int = 0


class GitHubContributionsResponse(BaseModel):
    username: str
    name: Optional[str] = None
    avatar_url: Optional[str] = None
    total_contributions: int = 0
    last_weeks_total: int = 0
    total_prs: int = 0
    merged_prs: int = 0
    lines_changed: int = 0
    heatmap_weeks: list[GitHubContributionWeek] = []
    recent: list[GitHubRecentContribution] = []


class SavedRepo(BaseModel):
    id: int
    name: str
    full_name: str
    owner: str
    description: Optional[str] = None
    language: Optional[str] = None
    stars: int = 0
    open_issues: int = 0
    html_url: str
    tags: list[str] = []
    difficulty: str = "Medium"
    saved_at: Optional[str] = None


class SavedReposResponse(BaseModel):
    repos: list[SavedRepo] = []


class Notification(BaseModel):
    id: str
    message: str
    read_status: bool = False
    created_at: str


class NotificationsResponse(BaseModel):
    notifications: list[Notification] = []


class ContributionCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "General"
    project: Optional[str] = None
    url: Optional[str] = None
    tags: list[str] = []
    occurred_at: Optional[str] = None


class Contribution(BaseModel):
    id: str
    title: str
    description: Optional[str] = None
    category: str = "General"
    project: Optional[str] = None
    url: Optional[str] = None
    tags: list[str] = []
    occurred_at: Optional[str] = None
    created_at: str


class ContributionsResponse(BaseModel):
    contributions: list[Contribution] = []


class AiFeaturedSection(BaseModel):
    name: str
    summary: str
    tags: list[str] = []
    meta: str


class AiRepoRecommendation(BaseModel):
    id: int
    name: str
    full_name: str
    owner: str
    description: str
    language: Optional[str] = None
    stars: int = 0
    open_issues: int = 0
    html_url: str
    match_probability: int
    reason: str
    tags: list[str] = []
    difficulty: str = "Medium"


class AiRecommendationsResponse(BaseModel):
    focus_area: str
    match_percent: int
    profile_tags: list[str] = []
    featured_sections: list[AiFeaturedSection] = []
    recommendations: list[AiRepoRecommendation] = []


class AiRepoIssueTarget(BaseModel):
    number: int
    title: str
    url: str
    state: str = "open"
    labels: list[str] = []
    difficulty: str = "Medium"
    reason: str = ""
    match_score: int = 0


class AiRepoBriefResponse(BaseModel):
    full_name: str
    html_url: str
    description: Optional[str] = None
    language: Optional[str] = None
    stars: int = 0
    open_issues: int = 0
    summary: str = ""
    why_contribute: str = ""
    contribution_value: list[str] = []
    caution_notes: list[str] = []
    profile_alignment: int = 0


class AiRepoDeepDiveResponse(BaseModel):
    full_name: str
    html_url: str
    default_branch: str = "main"
    docs_summary: str = ""
    quick_start: list[str] = []
    architecture_notes: list[str] = []
    tree_lines: list[str] = []
    target_issues: list[AiRepoIssueTarget] = []
