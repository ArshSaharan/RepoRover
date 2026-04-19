from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import RedirectResponse
import asyncio
import hashlib
import httpx
import json
import os
from firebase_admin import auth as firebase_auth, firestore
from datetime import datetime, timezone, timedelta
from collections import Counter

from config import settings
from models import (
    UserRegister,
    UserLogin,
    UserProfile,
    TokenResponse,
    GitHubStats,
    GitHubDiscoveryResponse,
    GitHubDiscoveryCategory,
    GitHubDiscoveryRepo,
    GitHubTrendingRepo,
    GitHubContributionDay,
    GitHubContributionWeek,
    GitHubRecentContribution,
    GitHubContributionsResponse,
)

router = APIRouter(prefix="/auth", tags=["Authentication"])

db = firestore.client()


# ─── Helpers ─────────────────────────────────────────────────────
async def verify_firebase_token(request: Request) -> dict:
    """Extract and verify Firebase ID token from Authorization header."""
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    token = auth_header.split("Bearer ")[1]
    try:
        decoded = firebase_auth.verify_id_token(token)
        return decoded
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")


def _upsert_user_in_firestore(uid: str, data: dict) -> tuple[dict, bool]:
    """Create or update a user document in Firestore.
    Returns (user_data, is_new_user).
    """
    user_ref = db.collection("users").document(uid)
    doc = user_ref.get()
    now = datetime.now(timezone.utc).isoformat()

    if doc.exists:
        data["updated_at"] = now
        # Always retain provider or existing data if not overwriting
        user_ref.update(data)
        return {**doc.to_dict(), **data, "is_new_user": False}, False
    else:
        data["uid"] = uid
        data["created_at"] = now
        data["updated_at"] = now
        data.setdefault("skills", [])
        data.setdefault("interests", [])
        data.setdefault("saved_repos", [])
        data.setdefault("availability", None)
        data.setdefault("bio", None)
        # If it's a GitHub user, we forced is_new_user to False so onboarding is skipped
        if "is_new_user" not in data:
            data["is_new_user"] = True
        user_ref.set(data)
        return data, True


async def _fetch_and_generate_github_profile(access_token: str, github_username: str, gh_user: dict):
    """Fetch GitHub stats and save them as a markdown file for LLM context."""
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
    }
    
    async with httpx.AsyncClient() as client:
        # Fetch repos (top 15 by updated)
        repos_resp = await client.get(
            f"https://api.github.com/user/repos?sort=updated&per_page=15&type=owner",
            headers=headers,
        )
        repos = []
        if repos_resp.status_code == 200:
            for r in repos_resp.json():
                repos.append({
                    "id": r.get("id"),
                    "name": r.get("name"),
                    "full_name": r.get("full_name"),
                    "owner": (r.get("owner") or {}).get("login"),
                    "description": r.get("description"),
                    "language": r.get("language"),
                    "stars": r.get("stargazers_count", 0),
                    "open_issues": r.get("open_issues_count", 0),
                    "updated_at": r.get("updated_at"),
                    "url": r.get("html_url"),
                })

        # Fetch PR count
        pr_resp = await client.get(
            f"https://api.github.com/search/issues?q=author:{github_username}+type:pr",
            headers=headers,
        )
        total_prs = pr_resp.json().get("total_count", 0) if pr_resp.status_code == 200 else 0

        # Fetch issues count
        issue_resp = await client.get(
            f"https://api.github.com/search/issues?q=author:{github_username}+type:issue",
            headers=headers,
        )
        total_issues = issue_resp.json().get("total_count", 0) if issue_resp.status_code == 200 else 0
        
        # Fetch commits count indirectly (estimate by public repos + PRs) OR fetch events (optional)
        # For LLM profile, we just use the stats we have
        
    stats = GitHubStats(
        username=github_username,
        name=gh_user.get("name"),
        avatar_url=gh_user.get("avatar_url"),
        bio=gh_user.get("bio"),
        location=gh_user.get("location"),
        public_repos=gh_user.get("public_repos", 0),
        followers=gh_user.get("followers", 0),
        following=gh_user.get("following", 0),
        total_prs=total_prs,
        total_issues=total_issues,
        repos=repos,
    )
    
    # Generate Markdown File
    os.makedirs("data/llm_profiles", exist_ok=True)
    md_path = f"data/llm_profiles/{github_username}.md"
    
    md_content = f"# Developer Profile: {stats.name or github_username} (@{github_username})\n\n"
    md_content += f"**Bio**: {stats.bio or 'No bio provided.'}\n\n"
    if stats.location:
        md_content += f"**Location**: {stats.location}\n\n"
    md_content += f"## GitHub Statistics\n"
    md_content += f"- **Public Repositories**: {stats.public_repos}\n"
    md_content += f"- **Total Pull Requests**: {stats.total_prs}\n"
    md_content += f"- **Total Issues**: {stats.total_issues}\n"
    md_content += f"- **Followers**: {stats.followers}\n"
    md_content += f"- **Following**: {stats.following}\n\n"
    
    md_content += f"## Top Repositories & Tech Stack\n"
    if repos:
        for r in repos:
            md_content += f"### [{r['name']}]({r['url']})\n"
            md_content += f"- **Description**: {r['description'] or 'N/A'}\n"
            md_content += f"- **Primary Language**: {r['language'] or 'Unknown'}\n"
            md_content += f"- **Stars**: {r['stars']}\n\n"
    else:
        md_content += "No public repositories found.\n"
        
    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
        
    return stats


def _github_headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
    }


def _load_github_auth(decoded: dict) -> tuple[dict, str, str]:
    uid = decoded["uid"]
    user_ref = db.collection("users").document(uid)
    doc = user_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="User not found")

    user_data = doc.to_dict()
    access_token = user_data.get("github_access_token")
    github_username = user_data.get("github_username")

    if not access_token or not github_username:
        raise HTTPException(status_code=400, detail="GitHub not linked")

    return user_data, access_token, github_username


def _normalize_repo(item: dict, preferred_languages: list[str]) -> GitHubDiscoveryRepo:
    language = item.get("language")
    tags = [tag for tag in item.get("topics", [])[:3] if isinstance(tag, str)]
    if not tags:
        if language:
            tags.append(language.lower())
        tags.append("open-source")

    language_match = language.lower() in preferred_languages if language else False
    match_score = 80
    if language_match:
        match_score += 12
    if item.get("stargazers_count", 0) > 5000:
        match_score += 4
    if item.get("open_issues_count", 0) > 20:
        match_score += 2
    match_score = max(70, min(99, match_score))

    open_issues = item.get("open_issues_count", 0)
    if open_issues >= 200:
        difficulty = "Hard"
    elif open_issues >= 50:
        difficulty = "Medium"
    else:
        difficulty = "Easy"

    return GitHubDiscoveryRepo(
        id=item.get("id", 0),
        name=item.get("name", "unknown"),
        full_name=item.get("full_name", "unknown/unknown"),
        owner=(item.get("owner") or {}).get("login", "unknown"),
        description=item.get("description"),
        language=language,
        stars=item.get("stargazers_count", 0),
        open_issues=open_issues,
        html_url=item.get("html_url", "#"),
        tags=tags,
        match_score=match_score,
        difficulty=difficulty,
    )


async def _discover_github_repositories(
    access_token: str,
    github_username: str,
    user_data: dict,
    query: str | None,
    per_page: int,
) -> GitHubDiscoveryResponse:
    headers = _github_headers(access_token)

    async with httpx.AsyncClient(timeout=20.0) as client:
        repos_resp = await client.get(
            "https://api.github.com/user/repos",
            params={"sort": "updated", "per_page": 30, "type": "owner"},
            headers=headers,
        )
        owned_repos = repos_resp.json() if repos_resp.status_code == 200 else []

        language_scores: Counter[str] = Counter()
        for repo in owned_repos:
            language = repo.get("language")
            if not language:
                continue
            language_scores[language.lower()] += max(1, repo.get("stargazers_count", 0) + 1)

        preferred_languages = [language for language, _ in language_scores.most_common(3)]
        if not preferred_languages:
            preferred_languages = [
                value.lower()
                for value in (user_data.get("skills") or user_data.get("interests") or ["typescript", "python"])
                if isinstance(value, str)
            ][:3]

        search_terms = [query.strip()] if query and query.strip() else preferred_languages[:3]
        if not search_terms:
            search_terms = ["typescript", "python"]

        repo_map: dict[int, GitHubDiscoveryRepo] = {}
        categories: list[GitHubDiscoveryCategory] = []

        per_term = max(4, min(6, per_page))
        for term in search_terms:
            if query and query.strip():
                github_query = f"{term} archived:false mirror:false"
                category_name = term.title()
                category_language = term
            else:
                github_query = f"language:{term} stars:>100 archived:false mirror:false"
                category_name = f"{term.title()} Projects"
                category_language = term

            search_resp = await client.get(
                "https://api.github.com/search/repositories",
                params={
                    "q": github_query,
                    "sort": "stars",
                    "order": "desc",
                    "per_page": per_term,
                },
                headers=headers,
            )
            if search_resp.status_code != 200:
                continue

            search_payload = search_resp.json()
            total_count = min(search_payload.get("total_count", 0), 9999)
            categories.append(
                GitHubDiscoveryCategory(
                    name=category_name,
                    language=category_language,
                    meta=f"{total_count} MATCHING REPOS",
                )
            )

            for item in search_payload.get("items", []):
                if (item.get("owner") or {}).get("login", "").lower() == github_username.lower():
                    continue
                normalized = _normalize_repo(item, preferred_languages)
                repo_map[normalized.id] = normalized

        repos = sorted(
            repo_map.values(),
            key=lambda repo: (repo.match_score, repo.stars, repo.open_issues),
            reverse=True,
        )[:per_page]

        trending = [
            GitHubTrendingRepo(
                name=repo.name,
                full_name=repo.full_name,
                language=repo.language,
                stars=repo.stars,
                html_url=repo.html_url,
                rank=f"#{index} {repo.language or 'OSS'}",
            )
            for index, repo in enumerate(sorted(repos, key=lambda repo: repo.stars, reverse=True)[:3], start=1)
        ]

        focus_area = (search_terms[0] if search_terms else "open source").title()
        match_percent = min(98, max(74, 76 + len(preferred_languages) * 6 + (4 if query else 10)))

        return GitHubDiscoveryResponse(
            focus_area=focus_area,
            match_percent=match_percent,
            categories=categories[:4],
            repos=repos,
            trending=trending,
        )


def _github_graphql_headers(access_token: str) -> dict:
    return {
        "Authorization": f"Bearer {access_token}",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
    }


def _contribution_level_to_int(level: str) -> int:
    mapping = {
        "NONE": 0,
        "FIRST_QUARTILE": 1,
        "SECOND_QUARTILE": 2,
        "THIRD_QUARTILE": 3,
        "FOURTH_QUARTILE": 4,
    }
    return mapping.get(level.upper(), 0)


def _repo_from_api_url(repository_url: str) -> str:
    marker = "/repos/"
    if marker not in repository_url:
        return "unknown/unknown"
    return repository_url.split(marker, 1)[1]


async def _fetch_pull_request_detail(client: httpx.AsyncClient, headers: dict, url: str) -> dict:
    response = await client.get(url, headers=headers)
    if response.status_code != 200:
        return {}

    payload = response.json()
    return payload if isinstance(payload, dict) else {}


CONTRIB_CACHE_COLLECTION = "github_contributions_cache"
CONTRIB_CACHE_REFRESH_SECONDS = 180


def _contrib_cache_ref(uid: str, weeks: int, recent_limit: int):
    return db.collection(CONTRIB_CACHE_COLLECTION).document(f"{uid}_w{weeks}_r{recent_limit}")


def _parse_iso_datetime(value: str | None) -> datetime | None:
    if not value or not isinstance(value, str):
        return None

    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)
    except Exception:
        return None


def _contrib_payload_signature(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _empty_heatmap_weeks(weeks: int, now: datetime) -> list[GitHubContributionWeek]:
    empty_weeks: list[GitHubContributionWeek] = []
    for week_idx in range(weeks):
        week_start = (now - timedelta(days=(weeks - week_idx) * 7)).date()
        days = [
            GitHubContributionDay(
                date=(week_start + timedelta(days=day_idx)).isoformat(),
                count=0,
                level=0,
            )
            for day_idx in range(7)
        ]
        empty_weeks.append(GitHubContributionWeek(first_day=week_start.isoformat(), days=days))

    return empty_weeks


async def _collect_github_contributions(
    user_data: dict,
    access_token: str,
    github_username: str,
    weeks: int,
    recent_limit: int,
) -> GitHubContributionsResponse:
    now = datetime.now(timezone.utc)
    from_date = now - timedelta(days=370)
    rest_headers = _github_headers(access_token)

    heatmap_weeks: list[GitHubContributionWeek] = []
    total_contributions = 0
    last_weeks_total = 0
    total_prs = 0
    merged_prs = 0
    lines_changed = 0
    recent: list[GitHubRecentContribution] = []

    async with httpx.AsyncClient(timeout=25.0) as client:
        graphql_response = await client.post(
            "https://api.github.com/graphql",
            json={
                "query": """
                query($login: String!, $from: DateTime!, $to: DateTime!) {
                  user(login: $login) {
                    contributionsCollection(from: $from, to: $to) {
                      contributionCalendar {
                        totalContributions
                        weeks {
                          firstDay
                          contributionDays {
                            date
                            contributionCount
                            contributionLevel
                          }
                        }
                      }
                    }
                  }
                }
                """,
                "variables": {
                    "login": github_username,
                    "from": from_date.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                    "to": now.replace(microsecond=0).isoformat().replace("+00:00", "Z"),
                },
            },
            headers=_github_graphql_headers(access_token),
        )

        if graphql_response.status_code == 200:
            graphql_payload = graphql_response.json()
            calendar = (
                ((graphql_payload.get("data") or {}).get("user") or {})
                .get("contributionsCollection", {})
                .get("contributionCalendar", {})
            )
            total_contributions = int(calendar.get("totalContributions", 0) or 0)

            calendar_weeks = calendar.get("weeks", []) if isinstance(calendar.get("weeks", []), list) else []
            selected_weeks = calendar_weeks[-weeks:]

            for week in selected_weeks:
                first_day = str(week.get("firstDay") or "")
                days: list[GitHubContributionDay] = []
                for day in week.get("contributionDays", []) or []:
                    days.append(
                        GitHubContributionDay(
                            date=str(day.get("date") or ""),
                            count=int(day.get("contributionCount", 0) or 0),
                            level=_contribution_level_to_int(str(day.get("contributionLevel") or "NONE")),
                        )
                    )

                last_weeks_total += sum(day.count for day in days)
                heatmap_weeks.append(GitHubContributionWeek(first_day=first_day, days=days))

        if not heatmap_weeks:
            heatmap_weeks = _empty_heatmap_weeks(weeks, now)

        total_prs_response = await client.get(
            "https://api.github.com/search/issues",
            params={"q": f"author:{github_username} type:pr"},
            headers=rest_headers,
        )
        if total_prs_response.status_code == 200:
            total_prs = int(total_prs_response.json().get("total_count", 0) or 0)

        merged_prs_response = await client.get(
            "https://api.github.com/search/issues",
            params={"q": f"author:{github_username} type:pr is:merged"},
            headers=rest_headers,
        )
        if merged_prs_response.status_code == 200:
            merged_prs = int(merged_prs_response.json().get("total_count", 0) or 0)

        sample_size = max(12, recent_limit * 3)
        recent_response = await client.get(
            "https://api.github.com/search/issues",
            params={
                "q": f"author:{github_username} type:pr",
                "sort": "updated",
                "order": "desc",
                "per_page": sample_size,
            },
            headers=rest_headers,
        )
        recent_items = recent_response.json().get("items", []) if recent_response.status_code == 200 else []

        source_items: list[dict] = []
        detail_tasks: list = []
        for item in recent_items:
            pr_url = str((item.get("pull_request") or {}).get("url") or "")
            if not pr_url:
                continue
            source_items.append(item)
            detail_tasks.append(_fetch_pull_request_detail(client, rest_headers, pr_url))

        details = await asyncio.gather(*detail_tasks) if detail_tasks else []

        for detail in details:
            if not detail:
                continue
            lines_changed += int(detail.get("additions", 0) or 0) + int(detail.get("deletions", 0) or 0)

        for index, source in enumerate(source_items[:recent_limit]):
            detail = details[index] if index < len(details) else {}
            merged_at = detail.get("merged_at")
            state = str(detail.get("state") or source.get("state") or "open").lower()
            status = "MERGED" if merged_at else ("OPEN" if state == "open" else "CLOSED")
            repository = (
                ((detail.get("base") or {}).get("repo") or {}).get("full_name")
                or _repo_from_api_url(str(source.get("repository_url") or ""))
            )

            recent.append(
                GitHubRecentContribution(
                    id=int(detail.get("id") or source.get("id") or index),
                    repo=str(repository or "unknown/unknown"),
                    title=str(detail.get("title") or source.get("title") or "Pull request"),
                    status=status,
                    url=str(detail.get("html_url") or source.get("html_url") or "#"),
                    occurred_at=str(
                        merged_at
                        or detail.get("updated_at")
                        or source.get("updated_at")
                        or now.replace(microsecond=0).isoformat()
                    ),
                    additions=int(detail.get("additions", 0) or 0),
                    deletions=int(detail.get("deletions", 0) or 0),
                )
            )

    return GitHubContributionsResponse(
        username=github_username,
        name=user_data.get("display_name") or github_username,
        avatar_url=user_data.get("avatar_url"),
        total_contributions=total_contributions,
        last_weeks_total=last_weeks_total,
        total_prs=total_prs,
        merged_prs=merged_prs,
        lines_changed=lines_changed,
        heatmap_weeks=heatmap_weeks,
        recent=recent,
    )


async def _refresh_contribution_cache(
    cache_ref,
    user_data: dict,
    access_token: str,
    github_username: str,
    weeks: int,
    recent_limit: int,
    previous_signature: str | None,
):
    checked_at = datetime.now(timezone.utc).isoformat()
    try:
        fresh = await _collect_github_contributions(user_data, access_token, github_username, weeks, recent_limit)
        payload = fresh.model_dump(mode="json")
        signature = _contrib_payload_signature(payload)

        if signature != (previous_signature or ""):
            cache_ref.set(
                {
                    "payload": payload,
                    "signature": signature,
                    "updated_at": checked_at,
                    "last_checked_at": checked_at,
                    "last_error": "",
                },
                merge=True,
            )
        else:
            cache_ref.set({"last_checked_at": checked_at}, merge=True)
    except Exception as error:
        cache_ref.set(
            {
                "last_checked_at": checked_at,
                "last_error": str(error)[:500],
            },
            merge=True,
        )


# ─── GitHub OAuth ────────────────────────────────────────────────
@router.get("/github")
async def github_login():
    """Redirect user to GitHub OAuth authorization page."""
    github_auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_CLIENT_ID}"
        f"&redirect_uri={settings.GITHUB_REDIRECT_URI}"
        f"&scope=read:user user:email repo"
    )
    return RedirectResponse(url=github_auth_url)


@router.get("/github/callback")
async def github_callback(code: str):
    """
    Handle GitHub OAuth callback:
    1. Exchange code for access token
    2. Fetch GitHub user profile
    3. Auto-generate LLM Markdown profile
    4. Create/update user in Firestore (is_new_user=False so it skips onboarding)
    5. Mint a Firebase custom token
    6. Redirect frontend with the token
    """
    # Exchange code for access token
    async with httpx.AsyncClient() as client:
        token_resp = await client.post(
            "https://github.com/login/oauth/access_token",
            json={
                "client_id": settings.GITHUB_CLIENT_ID,
                "client_secret": settings.GITHUB_CLIENT_SECRET,
                "code": code,
                "redirect_uri": settings.GITHUB_REDIRECT_URI,
            },
            headers={"Accept": "application/json"},
        )

    if token_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to exchange code for token")

    token_data = token_resp.json()
    access_token = token_data.get("access_token")

    if not access_token:
        raise HTTPException(
            status_code=400,
            detail=token_data.get("error_description", "No access token received"),
        )

    # Fetch GitHub user profile
    async with httpx.AsyncClient() as client:
        user_resp = await client.get(
            "https://api.github.com/user",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            },
        )
        emails_resp = await client.get(
            "https://api.github.com/user/emails",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.github+json",
            },
        )

    if user_resp.status_code != 200:
        raise HTTPException(status_code=400, detail="Failed to fetch GitHub user profile")

    github_user = user_resp.json()
    github_username = github_user.get("login", "")
    github_id = str(github_user.get("id", ""))
    avatar_url = github_user.get("avatar_url", "")
    display_name = github_user.get("name") or github_username

    # Fetch and generate MD profile in the background/inline
    await _fetch_and_generate_github_profile(access_token, github_username, github_user)

    # Get primary email
    email = github_user.get("email")
    if not email and emails_resp.status_code == 200:
        for e in emails_resp.json():
            if e.get("primary"):
                email = e.get("email")
                break

    # Create or get Firebase user
    uid = f"github_{github_id}"
    try:
        firebase_auth.get_user(uid)
    except firebase_auth.UserNotFoundError:
        firebase_auth.create_user(
            uid=uid,
            email=email,
            display_name=display_name,
            photo_url=avatar_url,
        )

    # Store / update in Firestore (include GitHub access token for later API calls)
    user_data, is_new = _upsert_user_in_firestore(uid, {
        "email": email,
        "display_name": display_name,
        "avatar_url": avatar_url,
        "github_username": github_username,
        "github_access_token": access_token,
        "provider": "github",
        "is_new_user": False  # Force to false so GitHub users never see onboarding
    })

    # Mint Firebase custom token
    custom_token = firebase_auth.create_custom_token(uid)
    if isinstance(custom_token, bytes):
        custom_token = custom_token.decode("utf-8")

    # Pass is_new=false explicitly back to frontend
    redirect_url = (
        f"{settings.FRONTEND_URL}/callback"
        f"?token={custom_token}"
        f"&is_new=false"
    )
    return RedirectResponse(url=redirect_url)


# ─── Email / Password Register ─────────────────────────────────
@router.post("/register", response_model=TokenResponse)
async def register(data: UserRegister):
    """
    Register a user who was already created client-side via Firebase Auth.
    Verifies the id_token, then stores the profile in Firestore.
    """
    try:
        decoded = firebase_auth.verify_id_token(data.id_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

    uid = decoded["uid"]
    email = decoded.get("email", "")
    fb_user = firebase_auth.get_user(uid)

    user_data, is_new = _upsert_user_in_firestore(uid, {
        "email": email,
        "display_name": data.display_name or fb_user.display_name or email.split("@")[0],
        "provider": "email",
    })

    return TokenResponse(
        token=data.id_token,
        uid=uid,
        email=email,
        display_name=user_data.get("display_name", ""),
        is_new_user=is_new,
    )


# ─── Verify Login (ID token from frontend) ──────────────────────
@router.post("/login")
async def login(data: UserLogin):
    """Verify a Firebase ID token and return the user profile."""
    try:
        decoded = firebase_auth.verify_id_token(data.id_token)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")

    uid = decoded["uid"]
    user_ref = db.collection("users").document(uid)
    doc = user_ref.get()

    if doc.exists:
        profile = doc.to_dict()
        profile["is_new_user"] = False
        return profile

    # If user logged in via Firebase Auth but no Firestore doc yet
    fb_user = firebase_auth.get_user(uid)
    profile, _ = _upsert_user_in_firestore(uid, {
        "email": fb_user.email,
        "display_name": fb_user.display_name or "",
        "avatar_url": fb_user.photo_url or "",
        "provider": "email",
    })
    return profile


# ─── Get Current User ───────────────────────────────────────────
@router.get("/me", response_model=UserProfile)
async def get_current_user(decoded: dict = Depends(verify_firebase_token)):
    """Get the currently authenticated user's profile."""
    uid = decoded["uid"]
    user_ref = db.collection("users").document(uid)
    doc = user_ref.get()

    if not doc.exists:
        raise HTTPException(status_code=404, detail="User profile not found")

    return UserProfile(**doc.to_dict())


# ─── Fetch GitHub Profile Data ──────────────────────────────────
@router.get("/github/profile", response_model=GitHubStats)
async def get_github_profile(decoded: dict = Depends(verify_firebase_token)):
    """Fetch the authenticated user's GitHub stats (repos, PRs, issues)."""
    _, access_token, github_username = _load_github_auth(decoded)

    # Fetch the exact same way
    async with httpx.AsyncClient() as client:
        user_resp = await client.get(
            "https://api.github.com/user",
            headers=_github_headers(access_token)
        )
        gh_user = user_resp.json() if user_resp.status_code == 200 else {}
        
    return await _fetch_and_generate_github_profile(access_token, github_username, gh_user)


@router.get("/github/contributions", response_model=GitHubContributionsResponse)
async def get_github_contributions(
    weeks: int = Query(default=14, ge=8, le=26),
    recent_limit: int = Query(default=4, ge=3, le=10),
    force_refresh: bool = Query(default=False),
    decoded: dict = Depends(verify_firebase_token),
):
    """Return cached contribution data immediately and refresh from GitHub in the background."""
    user_data, access_token, github_username = _load_github_auth(decoded)
    uid = decoded["uid"]
    cache_ref = _contrib_cache_ref(uid, weeks, recent_limit)
    now = datetime.now(timezone.utc)

    if not force_refresh:
        cache_doc = cache_ref.get()
        if cache_doc.exists:
            cache_data = cache_doc.to_dict() or {}
            cached_payload = cache_data.get("payload")
            previous_signature = str(cache_data.get("signature") or "")

            if isinstance(cached_payload, dict):
                try:
                    cached_response = GitHubContributionsResponse(**cached_payload)
                    last_checked = _parse_iso_datetime(cache_data.get("last_checked_at"))
                    if not last_checked:
                        last_checked = _parse_iso_datetime(cache_data.get("updated_at"))

                    if (
                        not last_checked
                        or (now - last_checked).total_seconds() >= CONTRIB_CACHE_REFRESH_SECONDS
                    ):
                        asyncio.create_task(
                            _refresh_contribution_cache(
                                cache_ref,
                                user_data,
                                access_token,
                                github_username,
                                weeks,
                                recent_limit,
                                previous_signature,
                            )
                        )

                    return cached_response
                except Exception:
                    pass

    fresh_response = await _collect_github_contributions(user_data, access_token, github_username, weeks, recent_limit)
    payload = fresh_response.model_dump(mode="json")
    signature = _contrib_payload_signature(payload)
    now_iso = now.isoformat()

    cache_ref.set(
        {
            "payload": payload,
            "signature": signature,
            "updated_at": now_iso,
            "last_checked_at": now_iso,
            "last_error": "",
        },
        merge=True,
    )

    return fresh_response


@router.get("/github/discover", response_model=GitHubDiscoveryResponse)
async def discover_github_repositories(
    q: str | None = Query(default=None, max_length=100),
    per_page: int = Query(default=12, ge=4, le=24),
    decoded: dict = Depends(verify_firebase_token),
):
    """Discover real GitHub repositories tailored to the authenticated user."""
    user_data, access_token, github_username = _load_github_auth(decoded)
    return await _discover_github_repositories(access_token, github_username, user_data, q, per_page)


# ─── Link GitHub to existing account ────────────────────────────
@router.get("/github/link")
async def github_link_start(request: Request):
    """Start GitHub OAuth flow for linking to an existing email account."""
    github_auth_url = (
        f"https://github.com/login/oauth/authorize"
        f"?client_id={settings.GITHUB_CLIENT_ID}"
        f"&redirect_uri={settings.GITHUB_REDIRECT_URI}"
        f"&scope=read:user user:email repo"
        f"&state=link"
    )
    return RedirectResponse(url=github_auth_url)
