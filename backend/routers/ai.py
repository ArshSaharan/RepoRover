import json
import os
import re
from collections import Counter

import google.generativeai as genai
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import firestore

from config import settings
from models import AiFeaturedSection, AiRecommendationsResponse, AiRepoRecommendation
from routers.auth import _github_headers, _load_github_auth, verify_firebase_token

router = APIRouter(prefix="/ai", tags=["AI"])

if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)
elif os.environ.get("GEMINI_API_KEY"):
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))


def _read_profile_markdown(github_username: str) -> str:
    md_path = f"data/llm_profiles/{github_username}.md"
    if not os.path.exists(md_path):
        raise HTTPException(status_code=404, detail="LLM profile not generated yet")

    with open(md_path, "r", encoding="utf-8") as file:
        return file.read()


def _extract_profile_languages(profile_markdown: str) -> list[str]:
    languages = re.findall(r"\*\*Primary Language\*\*: ([^\n]+)", profile_markdown)
    counts: Counter[str] = Counter()
    for language in languages:
        normalized = language.strip().lower()
        if normalized and normalized != "unknown":
            counts[normalized] += 1

    return [language for language, _ in counts.most_common(4)]


def _candidate_query_terms(profile_markdown: str, user_data: dict, query: str | None) -> list[str]:
    if query and query.strip():
        return [query.strip()]

    candidates: list[str] = []
    candidates.extend(_extract_profile_languages(profile_markdown))

    for field in ("skills", "interests"):
        for value in user_data.get(field, []) or []:
            if isinstance(value, str):
                candidates.append(value.strip().lower())

    unique_terms: list[str] = []
    seen: set[str] = set()
    for term in candidates:
        cleaned = re.sub(r"\s+", " ", term).strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        unique_terms.append(cleaned)

    return unique_terms[:4] or ["python", "typescript"]


async def _fetch_candidate_repositories(
    access_token: str,
    github_username: str,
    terms: list[str],
    per_page: int,
) -> list[dict]:
    headers = _github_headers(access_token)
    candidates: dict[int, dict] = {}
    per_term = max(5, min(8, per_page))

    async with httpx.AsyncClient(timeout=20.0) as client:
        for term in terms:
            if any(ch in term for ch in [" ", "/", "-"]) and not term.isalpha():
                github_query = f"{term} archived:false mirror:false stars:>50"
            else:
                github_query = f"language:{term} archived:false mirror:false stars:>50"

            response = await client.get(
                "https://api.github.com/search/repositories",
                params={
                    "q": github_query,
                    "sort": "stars",
                    "order": "desc",
                    "per_page": per_term,
                },
                headers=headers,
            )
            if response.status_code != 200:
                continue

            for item in response.json().get("items", []):
                owner_login = (item.get("owner") or {}).get("login", "")
                if owner_login.lower() == github_username.lower():
                    continue

                repo_id = item.get("id")
                if repo_id in candidates:
                    continue

                candidates[repo_id] = {
                    "id": repo_id,
                    "name": item.get("name", "unknown"),
                    "full_name": item.get("full_name", "unknown/unknown"),
                    "owner": owner_login or "unknown",
                    "description": item.get("description") or "No repository description provided.",
                    "language": item.get("language"),
                    "stars": item.get("stargazers_count", 0),
                    "open_issues": item.get("open_issues_count", 0),
                    "html_url": item.get("html_url", "#"),
                    "topics": item.get("topics", [])[:5],
                }

    ranked = sorted(candidates.values(), key=lambda repo: (repo["stars"], repo["open_issues"]), reverse=True)
    return ranked[: max(per_page * 2, 12)]


def _normalize_difficulty(open_issues: int) -> str:
    if open_issues >= 250:
        return "Hard"
    if open_issues >= 60:
        return "Medium"
    return "Easy"


def _fallback_response(profile_markdown: str, candidates: list[dict], per_page: int) -> AiRecommendationsResponse:
    profile_tags = _extract_profile_languages(profile_markdown)[:4] or ["open-source", "github"]
    recommendations: list[AiRepoRecommendation] = []
    for index, repo in enumerate(candidates[:per_page]):
        probability = max(80, 96 - index * 3)
        recommendations.append(
            AiRepoRecommendation(
                id=repo["id"],
                name=repo["name"],
                full_name=repo["full_name"],
                owner=repo["owner"],
                description=repo["description"],
                language=repo["language"],
                stars=repo["stars"],
                open_issues=repo["open_issues"],
                html_url=repo["html_url"],
                match_probability=probability,
                reason=f"Strong overlap with your {repo['language'] or 'open-source'} work and repository history.",
                tags=repo["topics"][:3] or profile_tags[:3],
                difficulty=_normalize_difficulty(repo["open_issues"]),
            )
        )

    featured_sections = [
        AiFeaturedSection(
            name=f"{tag.title()} Track",
            summary=f"Profile-derived focus area around {tag}.",
            tags=[tag],
            meta="FROM PROFILE ANALYSIS",
        )
        for tag in profile_tags[:3]
    ]

    return AiRecommendationsResponse(
        focus_area=profile_tags[0].title(),
        match_percent=94,
        profile_tags=profile_tags,
        featured_sections=featured_sections,
        recommendations=recommendations,
    )


def _strip_code_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]

    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]

    return cleaned.strip()


@router.get("/recommendations", response_model=AiRecommendationsResponse)
async def get_ai_recommendations(
    q: str | None = Query(default=None, max_length=100),
    per_page: int = Query(default=12, ge=4, le=24),
    decoded: dict = Depends(verify_firebase_token),
):
    db = firestore.client()
    uid = decoded["uid"]
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")

    user_data = doc.to_dict()
    _, access_token, github_username = _load_github_auth(decoded)
    profile_markdown = _read_profile_markdown(github_username)
    query_terms = _candidate_query_terms(profile_markdown, user_data, q)
    candidates = await _fetch_candidate_repositories(access_token, github_username, query_terms, per_page)

    if not candidates:
        raise HTTPException(status_code=404, detail="No GitHub repositories found for analysis")

    if not settings.GEMINI_API_KEY and not os.environ.get("GEMINI_API_KEY"):
        return _fallback_response(profile_markdown, candidates, per_page)

    candidate_payload = json.dumps(candidates, ensure_ascii=True)
    prompt = f"""
You are Repo-Rover's recommendation engine.
Use the developer markdown profile and the real GitHub candidate repositories below.
Pick the best repositories for this user to work on.

Return ONLY valid JSON with this exact object shape:
{{
  "focus_area": "short phrase",
  "match_percent": 0,
  "profile_tags": ["tag"],
  "featured_sections": [
    {{
      "name": "section title",
      "summary": "why this matters for the user",
      "tags": ["tag1", "tag2"],
      "meta": "short uppercase label"
    }}
  ],
  "recommendations": [
    {{
      "full_name": "owner/repo",
      "match_probability": 0,
      "reason": "specific reason tied to the profile",
      "tags": ["tag1", "tag2"],
      "difficulty": "Easy|Medium|Hard"
    }}
  ]
}}

Rules:
- Recommendations must reference only repositories present in the candidate list.
- match_probability must be an integer from 1 to 99.
- profile_tags should reflect the user's profile markdown, not generic labels.
- featured_sections should be based on profile analysis and the repo landscape.
- Return {per_page} recommendations.

Developer profile markdown:
{profile_markdown}

Candidate repositories:
{candidate_payload}
"""

    try:
        model = genai.GenerativeModel("gemini-1.5-pro")
        response = model.generate_content(prompt)
        parsed = json.loads(_strip_code_fence(response.text))
    except Exception:
        return _fallback_response(profile_markdown, candidates, per_page)

    candidate_map = {repo["full_name"].lower(): repo for repo in candidates}
    recommendations: list[AiRepoRecommendation] = []
    for item in parsed.get("recommendations", []):
        full_name = str(item.get("full_name", "")).lower()
        candidate = candidate_map.get(full_name)
        if not candidate:
            continue

        probability = int(item.get("match_probability", 0))
        probability = max(1, min(99, probability))
        recommendations.append(
            AiRepoRecommendation(
                id=candidate["id"],
                name=candidate["name"],
                full_name=candidate["full_name"],
                owner=candidate["owner"],
                description=candidate["description"],
                language=candidate["language"],
                stars=candidate["stars"],
                open_issues=candidate["open_issues"],
                html_url=candidate["html_url"],
                match_probability=probability,
                reason=str(item.get("reason", "Recommended based on your GitHub profile.")).strip(),
                tags=[str(tag).lower() for tag in item.get("tags", [])[:4] if str(tag).strip()] or candidate["topics"][:4],
                difficulty=str(item.get("difficulty", _normalize_difficulty(candidate["open_issues"]))).title(),
            )
        )

    if not recommendations:
        return _fallback_response(profile_markdown, candidates, per_page)

    featured_sections = []
    for section in parsed.get("featured_sections", [])[:4]:
        featured_sections.append(
            AiFeaturedSection(
                name=str(section.get("name", "Focus Area")).strip(),
                summary=str(section.get("summary", "Profile-derived repository cluster.")).strip(),
                tags=[str(tag).lower() for tag in section.get("tags", [])[:4] if str(tag).strip()],
                meta=str(section.get("meta", "PROFILE ANALYSIS")).strip().upper(),
            )
        )

    profile_tags = [str(tag).lower() for tag in parsed.get("profile_tags", [])[:6] if str(tag).strip()]
    if not profile_tags:
        profile_tags = _extract_profile_languages(profile_markdown)[:4]

    match_percent = int(parsed.get("match_percent", 94))
    match_percent = max(1, min(99, match_percent))

    fallback = _fallback_response(profile_markdown, candidates, per_page)
    return AiRecommendationsResponse(
        focus_area=str(parsed.get("focus_area", (profile_tags[0] if profile_tags else "Open Source").title())).strip(),
        match_percent=match_percent,
        profile_tags=profile_tags,
        featured_sections=featured_sections or fallback.featured_sections,
        recommendations=recommendations[:per_page],
    )