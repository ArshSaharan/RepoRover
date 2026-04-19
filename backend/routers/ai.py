import asyncio
import base64
import hashlib
import json
import os
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone

import google.generativeai as genai
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from firebase_admin import firestore

from config import settings
from models import (
    AiFeaturedSection,
    AiRecommendationsResponse,
    AiRepoRecommendation,
    AiRepoBriefResponse,
    AiRepoDeepDiveResponse,
    AiRepoIssueTarget,
)
from routers.auth import _github_headers, _load_github_auth, verify_firebase_token

router = APIRouter(prefix="/ai", tags=["AI"])
db = firestore.client()

AI_CACHE_COLLECTION = "ai_response_cache"
AI_RECOMMENDATIONS_TTL_SECONDS = 5 * 60
AI_REPO_INTEL_TTL_SECONDS = 10 * 60
REPO_TREE_FORMAT_VERSION = "smart-v2"

CORE_DIR_HINTS = {
    "src",
    "app",
    "apps",
    "backend",
    "frontend",
    "client",
    "server",
    "api",
    "lib",
    "libs",
    "core",
    "modules",
    "module",
    "services",
    "service",
    "packages",
    "pkg",
    "internal",
    "cmd",
    "cli",
    "extensions",
    "remote",
    "resources",
    "web",
    "ui",
    "engine",
    "runtime",
}

TEST_DIR_HINTS = {
    "test",
    "tests",
    "__tests__",
    "spec",
    "specs",
    "e2e",
    "integration",
    "bench",
    "benchmark",
    "benchmarks",
}

DOC_DIR_HINTS = {
    "docs",
    "doc",
    "documentation",
    "examples",
    "example",
    "samples",
    "sample",
}

TOOLING_DIR_HINTS = {
    "build",
    "scripts",
    "script",
    "tools",
    "tooling",
    "config",
    "configs",
    "ci",
    "infra",
    "devops",
    "tasks",
}

CORE_DIR_PRIORITY = {
    "src": 1,
    "app": 2,
    "apps": 3,
    "backend": 4,
    "frontend": 5,
    "api": 6,
    "server": 7,
    "client": 8,
    "packages": 9,
    "lib": 10,
    "extensions": 11,
    "remote": 12,
    "cli": 13,
}

TEST_DIR_PRIORITY = {
    "test": 1,
    "tests": 2,
    "__tests__": 3,
    "e2e": 4,
    "spec": 5,
}

DOC_DIR_PRIORITY = {
    "docs": 1,
    "documentation": 2,
    "examples": 3,
    "samples": 4,
}

TOOLING_DIR_PRIORITY = {
    "build": 1,
    "scripts": 2,
    "tools": 3,
    "config": 4,
    "ci": 5,
}

ROOT_FILE_PRIORITY = {
    "readme.md": 1,
    "readme": 2,
    "contributing.md": 3,
    "license": 4,
    "package.json": 5,
    "pnpm-workspace.yaml": 6,
    "pnpm-lock.yaml": 7,
    "yarn.lock": 8,
    "package-lock.json": 9,
    "pyproject.toml": 10,
    "requirements.txt": 11,
    "poetry.lock": 12,
    "cargo.toml": 13,
    "go.mod": 14,
    "pom.xml": 15,
    "build.gradle": 16,
    "dockerfile": 17,
}

CODE_FILE_EXTENSIONS = {
    ".py",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".go",
    ".rs",
    ".java",
    ".cs",
    ".cpp",
    ".c",
    ".cc",
    ".h",
    ".hpp",
    ".swift",
    ".kt",
    ".php",
    ".rb",
    ".scala",
    ".dart",
    ".lua",
    ".sh",
    ".ps1",
    ".sql",
}

if settings.GEMINI_API_KEY:
    genai.configure(api_key=settings.GEMINI_API_KEY)
elif os.environ.get("GEMINI_API_KEY"):
    genai.configure(api_key=os.environ.get("GEMINI_API_KEY"))


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


def _payload_signature(payload: dict) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _ai_cache_ref(uid: str, namespace: str, key: str):
    key_hash = hashlib.sha256(f"{namespace}:{key}".encode("utf-8")).hexdigest()
    return db.collection(AI_CACHE_COLLECTION).document(f"{uid}_{key_hash}")


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


def _strip_code_fence(text: str) -> str:
    cleaned = text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[7:]
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:]
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3]
    return cleaned.strip()


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


async def _build_ai_recommendations(
    user_data: dict,
    access_token: str,
    github_username: str,
    query: str | None,
    per_page: int,
) -> AiRecommendationsResponse:
    profile_markdown = _read_profile_markdown(github_username)
    query_terms = _candidate_query_terms(profile_markdown, user_data, query)
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


async def _refresh_recommendations_cache(
    cache_ref,
    user_data: dict,
    access_token: str,
    github_username: str,
    query: str | None,
    per_page: int,
    previous_signature: str | None,
):
    checked_at = datetime.now(timezone.utc).isoformat()
    try:
        fresh = await _build_ai_recommendations(user_data, access_token, github_username, query, per_page)
        payload = fresh.model_dump(mode="json")
        signature = _payload_signature(payload)
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


def _decode_readme_content(payload: dict) -> str:
    content = str(payload.get("content") or "")
    encoding = str(payload.get("encoding") or "")
    if not content:
        return ""
    if encoding.lower() == "base64":
        try:
            return base64.b64decode(content).decode("utf-8", errors="ignore")
        except Exception:
            return ""
    return content


def _is_code_file_path(path: str) -> bool:
    extension = os.path.splitext(path.lower())[1]
    return extension in CODE_FILE_EXTENSIONS or path.lower().endswith(".d.ts")


def _classify_top_dir(top_dir: str, entries: list[dict]) -> str:
    name = top_dir.lower()
    if name.startswith("."):
        return "hidden"
    if name in CORE_DIR_HINTS:
        return "core"
    if name in TEST_DIR_HINTS:
        return "tests"
    if name in DOC_DIR_HINTS:
        return "docs"
    if name in TOOLING_DIR_HINTS:
        return "tooling"

    descendant_paths = [
        str(entry.get("path") or "")
        for entry in entries
        if str(entry.get("path") or "").startswith(f"{top_dir}/")
    ]
    code_files = sum(1 for path in descendant_paths if _is_code_file_path(path))
    test_like = sum(1 for path in descendant_paths if any(tag in path.lower() for tag in ("/test", "_test", "spec", "e2e")))
    docs_like = sum(1 for path in descendant_paths if any(tag in path.lower() for tag in ("/docs", "readme", "/example")))

    if code_files >= max(3, docs_like * 2):
        return "core"
    if test_like >= 3:
        return "tests"
    if docs_like >= max(2, code_files):
        return "docs"
    return "tooling"


def _preview_dir_entries(
    top_dir: str,
    entries: list[dict],
    max_depth: int,
    max_items: int,
    include_hidden: bool,
) -> tuple[list[tuple[str, str]], int]:
    prefix = f"{top_dir}/"
    visible: list[tuple[str, str]] = []
    seen: set[str] = set()
    descendant_total = 0

    for entry in entries:
        path = str(entry.get("path") or "")
        if not path.startswith(prefix):
            continue

        relative = path[len(prefix) :]
        if not relative:
            continue
        descendant_total += 1

        parts = [part for part in relative.split("/") if part]
        if not parts:
            continue
        if not include_hidden and any(part.startswith(".") for part in parts):
            continue
        if len(parts) - 1 > max_depth:
            continue

        kind = "D" if str(entry.get("type")) == "tree" else "F"
        dedupe_key = f"{kind}:{relative}"
        if dedupe_key in seen:
            continue
        seen.add(dedupe_key)
        visible.append((kind, relative))

    visible.sort(key=lambda item: (item[1].count("/"), 1 if item[0] == "F" else 0, item[1].lower()))
    selected = visible[:max_items]
    omitted = max(0, descendant_total - len(selected))
    return selected, omitted


def _format_tree_lines(tree_items: list[dict], max_items: int = 120) -> list[str]:
    normalized: list[dict] = []
    for item in tree_items:
        if not isinstance(item, dict):
            continue
        raw_path = str(item.get("path") or "").strip().strip("/")
        if not raw_path:
            continue
        normalized.append(
            {
                "path": raw_path,
                "type": "tree" if str(item.get("type")) == "tree" else "blob",
            }
        )

    if not normalized:
        return []

    entries_by_top: dict[str, list[dict]] = defaultdict(list)
    top_dirs: set[str] = set()
    root_files: set[str] = set()

    for entry in normalized:
        path = str(entry["path"])
        top_dir = path.split("/", 1)[0]
        entries_by_top[top_dir].append(entry)

        if "/" not in path:
            if entry["type"] == "tree":
                top_dirs.add(top_dir)
            else:
                root_files.add(path)
        else:
            top_dirs.add(top_dir)

    grouped: dict[str, list[str]] = {
        "core": [],
        "tests": [],
        "docs": [],
        "tooling": [],
        "hidden": [],
    }
    for top_dir in sorted(top_dirs):
        bucket = _classify_top_dir(top_dir, entries_by_top.get(top_dir, []))
        grouped[bucket].append(top_dir)

    def _sort_dirs(dirs: list[str], priority_map: dict[str, int]) -> list[str]:
        return sorted(dirs, key=lambda name: (priority_map.get(name.lower(), 99), name.lower()))

    grouped["core"] = _sort_dirs(grouped["core"], CORE_DIR_PRIORITY)
    grouped["tests"] = _sort_dirs(grouped["tests"], TEST_DIR_PRIORITY)
    grouped["docs"] = _sort_dirs(grouped["docs"], DOC_DIR_PRIORITY)
    grouped["tooling"] = _sort_dirs(grouped["tooling"], TOOLING_DIR_PRIORITY)
    grouped["hidden"] = sorted(grouped["hidden"], key=lambda value: value.lower())

    output_entries: list[tuple[str, str]] = []
    seen_paths: set[str] = set()

    def _push(kind: str, path: str):
        clean_path = path.strip().strip("/")
        if not clean_path or clean_path in seen_paths:
            return
        seen_paths.add(clean_path)
        output_entries.append((kind, clean_path))

    def _append_category(
        category_name: str,
        dirs: list[str],
        dir_limit: int,
        depth_limit: int,
        item_limit: int,
    ):
        if not dirs:
            return

        _push("D", category_name)
        limited = dirs[:dir_limit]
        for top_dir in limited:
            category_base = f"{category_name}/{top_dir}"
            _push("D", category_base)

            preview, omitted = _preview_dir_entries(
                top_dir=top_dir,
                entries=entries_by_top.get(top_dir, []),
                max_depth=depth_limit,
                max_items=item_limit,
                include_hidden=False,
            )
            for kind, relative in preview:
                _push(kind, f"{category_base}/{relative}")

            if omitted > 0:
                _push("F", f"{category_base}/... {omitted} more entries")

        if len(dirs) > dir_limit:
            _push("F", f"{category_name}/... {len(dirs) - dir_limit} more directories")

    _append_category("Core Product Code", grouped["core"], dir_limit=6, depth_limit=2, item_limit=12)
    _append_category("Tests and Quality", grouped["tests"], dir_limit=3, depth_limit=2, item_limit=8)
    _append_category("Docs and Examples", grouped["docs"], dir_limit=3, depth_limit=2, item_limit=8)
    _append_category("Build and Tooling", grouped["tooling"], dir_limit=4, depth_limit=1, item_limit=6)

    visible_root_files = sorted(
        [name for name in root_files if not name.startswith(".")],
        key=lambda name: (ROOT_FILE_PRIORITY.get(name.lower(), 99), name.lower()),
    )
    if visible_root_files:
        _push("D", "Root Essentials")
        for filename in visible_root_files[:10]:
            _push("F", f"Root Essentials/{filename}")
        if len(visible_root_files) > 10:
            _push("F", f"Root Essentials/... {len(visible_root_files) - 10} more root files")

    hidden_root_files = sorted([name for name in root_files if name.startswith(".")], key=lambda name: name.lower())
    hidden_dirs = grouped["hidden"]
    if hidden_dirs or hidden_root_files:
        _push("D", "Hidden and Infra (collapsed)")
        for hidden_dir in hidden_dirs[:6]:
            hidden_base = f"Hidden and Infra (collapsed)/{hidden_dir}"
            _push("D", hidden_base)
            descendants = sum(
                1
                for entry in entries_by_top.get(hidden_dir, [])
                if str(entry.get("path") or "").startswith(f"{hidden_dir}/")
            )
            if descendants > 0:
                _push("F", f"{hidden_base}/... {descendants} hidden entries")

        if len(hidden_dirs) > 6:
            _push("F", f"Hidden and Infra (collapsed)/... {len(hidden_dirs) - 6} more hidden directories")
        if hidden_root_files:
            _push("F", f"Hidden and Infra (collapsed)/root-dotfiles/... {len(hidden_root_files)} hidden root files")

    if not output_entries:
        # Safety fallback if smart grouping fails for uncommon repository structures.
        fallback = sorted(normalized, key=lambda entry: str(entry["path"]))[:max_items]
        return [
            f"[{'D' if str(entry['type']) == 'tree' else 'F'}] {entry['path']}"
            for entry in fallback
        ]

    return [f"[{kind}] {path}" for kind, path in output_entries[:max_items]]


def _issue_difficulty_from_labels(labels: list[str], comments: int) -> str:
    lowered = [label.lower() for label in labels]
    if any("good first issue" in label or "beginner" in label for label in lowered):
        return "Easy"
    if any("documentation" in label or "docs" in label for label in lowered):
        return "Easy"
    if comments >= 8 or any("refactor" in label or "breaking" in label for label in lowered):
        return "Hard"
    return "Medium"


async def _fetch_repo_context(access_token: str, full_name: str, include_deep: bool) -> dict:
    headers = _github_headers(access_token)
    async with httpx.AsyncClient(timeout=25.0) as client:
        repo_response = await client.get(f"https://api.github.com/repos/{full_name}", headers=headers)
        if repo_response.status_code != 200:
            raise HTTPException(status_code=404, detail="Repository not found on GitHub")

        repo = repo_response.json()
        default_branch = str(repo.get("default_branch") or "main")

        readme_response = await client.get(f"https://api.github.com/repos/{full_name}/readme", headers=headers)
        readme_text = _decode_readme_content(readme_response.json()) if readme_response.status_code == 200 else ""

        tree_lines: list[str] = []
        issues: list[dict] = []

        if include_deep:
            tree_response = await client.get(
                f"https://api.github.com/repos/{full_name}/git/trees/{default_branch}",
                params={"recursive": 1},
                headers=headers,
            )
            if tree_response.status_code == 200:
                tree_payload = tree_response.json()
                tree_lines = _format_tree_lines(tree_payload.get("tree", []) if isinstance(tree_payload, dict) else [])

            issues_response = await client.get(
                f"https://api.github.com/repos/{full_name}/issues",
                params={"state": "open", "sort": "updated", "direction": "desc", "per_page": 30},
                headers=headers,
            )
            if issues_response.status_code == 200:
                for item in issues_response.json():
                    if item.get("pull_request"):
                        continue
                    labels = [str(label.get("name", "")).strip() for label in item.get("labels", []) if str(label.get("name", "")).strip()]
                    issues.append(
                        {
                            "number": int(item.get("number", 0) or 0),
                            "title": str(item.get("title") or "Issue"),
                            "url": str(item.get("html_url") or "#"),
                            "state": str(item.get("state") or "open"),
                            "labels": labels,
                            "comments": int(item.get("comments", 0) or 0),
                            "difficulty": _issue_difficulty_from_labels(labels, int(item.get("comments", 0) or 0)),
                        }
                    )

    return {
        "repo": repo,
        "readme_text": readme_text,
        "tree_lines": tree_lines,
        "issues": issues,
    }


def _fallback_repo_brief(full_name: str, context: dict, profile_markdown: str) -> AiRepoBriefResponse:
    repo = context["repo"]
    language = str(repo.get("language") or "")
    lower_profile = profile_markdown.lower()
    alignment = 88 if language and language.lower() in lower_profile else 75

    return AiRepoBriefResponse(
        full_name=full_name,
        html_url=str(repo.get("html_url") or "#"),
        description=repo.get("description"),
        language=repo.get("language"),
        stars=int(repo.get("stargazers_count", 0) or 0),
        open_issues=int(repo.get("open_issues_count", 0) or 0),
        summary=(
            str(repo.get("description") or "Open-source project")
            + ". Maintained repository with active issues and contribution opportunities."
        ),
        why_contribute="This project aligns with your profile technologies and offers practical open issues to build real impact.",
        contribution_value=[
            "Gain hands-on experience with a production codebase.",
            "Build public contribution history in your main stack.",
            "Collaborate through issue discussions and PR review cycles.",
        ],
        caution_notes=[
            "Read contribution guidelines and setup steps before coding.",
            "Start with scoped issues to ship a fast first PR.",
        ],
        profile_alignment=alignment,
    )


def _fallback_repo_deep(full_name: str, context: dict) -> AiRepoDeepDiveResponse:
    repo = context["repo"]
    issues = context["issues"]
    targets = [
        AiRepoIssueTarget(
            number=issue["number"],
            title=issue["title"],
            url=issue["url"],
            state=issue["state"],
            labels=issue["labels"],
            difficulty=issue["difficulty"],
            reason="Good entry point based on issue activity and labels.",
            match_score=max(70, 88 - idx * 4),
        )
        for idx, issue in enumerate(issues[:5])
        if issue.get("number")
    ]

    return AiRepoDeepDiveResponse(
        full_name=full_name,
        html_url=str(repo.get("html_url") or "#"),
        default_branch=str(repo.get("default_branch") or "main"),
        docs_summary="Start with the README and contribution docs, then run local setup and tests before choosing an issue.",
        quick_start=[
            "Fork and clone the repository.",
            "Run install and test commands from README.",
            "Pick one open issue with clear acceptance criteria.",
        ],
        architecture_notes=[
            "Use the file tree to locate core modules and entry points.",
            "Review existing tests around the target area before changing code.",
        ],
        tree_lines=context["tree_lines"][:120],
        target_issues=targets,
    )


async def _build_repo_brief(
    full_name: str,
    access_token: str,
    profile_markdown: str,
) -> AiRepoBriefResponse:
    context = await _fetch_repo_context(access_token, full_name, include_deep=False)
    repo = context["repo"]

    if not settings.GEMINI_API_KEY and not os.environ.get("GEMINI_API_KEY"):
        return _fallback_repo_brief(full_name, context, profile_markdown)

    prompt = f"""
You are an open-source mentor. Analyze this repository for a developer profile.

Return ONLY valid JSON with this exact shape:
{{
  "summary": "2-3 sentence project summary",
  "why_contribute": "why this repository is a good contribution target",
  "contribution_value": ["benefit", "benefit", "benefit"],
  "caution_notes": ["note", "note"],
  "profile_alignment": 0
}}

Rules:
- profile_alignment must be integer between 1 and 99.
- Keep contribution_value to max 4 bullets.
- Keep caution_notes to max 3 bullets.

Developer profile markdown:
{profile_markdown[:7000]}

Repository:
- Full name: {full_name}
- Description: {repo.get('description')}
- Language: {repo.get('language')}
- Stars: {repo.get('stargazers_count')}
- Open issues: {repo.get('open_issues_count')}

README excerpt:
{context['readme_text'][:6000]}
"""

    try:
        model = genai.GenerativeModel("gemini-1.5-pro")
        parsed = json.loads(_strip_code_fence(model.generate_content(prompt).text))
        alignment = max(1, min(99, int(parsed.get("profile_alignment", 80))))
        return AiRepoBriefResponse(
            full_name=full_name,
            html_url=str(repo.get("html_url") or "#"),
            description=repo.get("description"),
            language=repo.get("language"),
            stars=int(repo.get("stargazers_count", 0) or 0),
            open_issues=int(repo.get("open_issues_count", 0) or 0),
            summary=str(parsed.get("summary", "")).strip(),
            why_contribute=str(parsed.get("why_contribute", "")).strip(),
            contribution_value=[str(item).strip() for item in parsed.get("contribution_value", [])[:4] if str(item).strip()],
            caution_notes=[str(item).strip() for item in parsed.get("caution_notes", [])[:3] if str(item).strip()],
            profile_alignment=alignment,
        )
    except Exception:
        return _fallback_repo_brief(full_name, context, profile_markdown)


async def _build_repo_deep(
    full_name: str,
    access_token: str,
    profile_markdown: str,
) -> AiRepoDeepDiveResponse:
    context = await _fetch_repo_context(access_token, full_name, include_deep=True)
    repo = context["repo"]
    issues = context["issues"]

    if not settings.GEMINI_API_KEY and not os.environ.get("GEMINI_API_KEY"):
        return _fallback_repo_deep(full_name, context)

    issue_payload = json.dumps(issues[:20], ensure_ascii=True)
    tree_snippet = "\n".join(context["tree_lines"][:120])
    prompt = f"""
You are a senior maintainer helping a developer contribute to a repository.

Return ONLY valid JSON with this shape:
{{
  "docs_summary": "short explanation of how to approach this repo",
  "quick_start": ["step", "step", "step"],
  "architecture_notes": ["note", "note", "note"],
  "target_issues": [
    {{ "number": 0, "reason": "why this issue matches profile", "match_score": 0, "difficulty": "Easy|Medium|Hard" }}
  ]
}}

Rules:
- target_issues numbers must exist in provided issue list.
- match_score is integer 1..99.
- quick_start max 5 items.
- architecture_notes max 5 items.
- target_issues max 6 items.

Developer profile markdown:
{profile_markdown[:7000]}

Repository: {full_name}
README excerpt:
{context['readme_text'][:7000]}

File tree excerpt:
{tree_snippet}

Open issues:
{issue_payload}
"""

    try:
        model = genai.GenerativeModel("gemini-1.5-pro")
        parsed = json.loads(_strip_code_fence(model.generate_content(prompt).text))

        issue_map = {int(issue["number"]): issue for issue in issues if issue.get("number")}
        targets: list[AiRepoIssueTarget] = []
        for item in parsed.get("target_issues", [])[:6]:
            number = int(item.get("number", 0) or 0)
            base_issue = issue_map.get(number)
            if not base_issue:
                continue

            score = max(1, min(99, int(item.get("match_score", 75))))
            targets.append(
                AiRepoIssueTarget(
                    number=number,
                    title=str(base_issue.get("title") or "Issue"),
                    url=str(base_issue.get("url") or "#"),
                    state=str(base_issue.get("state") or "open"),
                    labels=[str(label) for label in base_issue.get("labels", [])[:6]],
                    difficulty=str(item.get("difficulty", base_issue.get("difficulty", "Medium"))).title(),
                    reason=str(item.get("reason", "Good match for your profile.")).strip(),
                    match_score=score,
                )
            )

        if not targets and issues:
            return _fallback_repo_deep(full_name, context)

        return AiRepoDeepDiveResponse(
            full_name=full_name,
            html_url=str(repo.get("html_url") or "#"),
            default_branch=str(repo.get("default_branch") or "main"),
            docs_summary=str(parsed.get("docs_summary", "")).strip(),
            quick_start=[str(item).strip() for item in parsed.get("quick_start", [])[:5] if str(item).strip()],
            architecture_notes=[str(item).strip() for item in parsed.get("architecture_notes", [])[:5] if str(item).strip()],
            tree_lines=context["tree_lines"][:120],
            target_issues=targets,
        )
    except Exception:
        return _fallback_repo_deep(full_name, context)


async def _refresh_repo_brief_cache(
    cache_ref,
    full_name: str,
    access_token: str,
    profile_markdown: str,
    previous_signature: str | None,
):
    checked_at = datetime.now(timezone.utc).isoformat()
    try:
        fresh = await _build_repo_brief(full_name, access_token, profile_markdown)
        payload = fresh.model_dump(mode="json")
        signature = _payload_signature(payload)
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
        cache_ref.set({"last_checked_at": checked_at, "last_error": str(error)[:500]}, merge=True)


async def _refresh_repo_deep_cache(
    cache_ref,
    full_name: str,
    access_token: str,
    profile_markdown: str,
    previous_signature: str | None,
):
    checked_at = datetime.now(timezone.utc).isoformat()
    try:
        fresh = await _build_repo_deep(full_name, access_token, profile_markdown)
        payload = fresh.model_dump(mode="json")
        signature = _payload_signature(payload)
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
        cache_ref.set({"last_checked_at": checked_at, "last_error": str(error)[:500]}, merge=True)


@router.get("/recommendations", response_model=AiRecommendationsResponse)
async def get_ai_recommendations(
    q: str | None = Query(default=None, max_length=100),
    per_page: int = Query(default=12, ge=4, le=24),
    force_refresh: bool = Query(default=False),
    decoded: dict = Depends(verify_firebase_token),
):
    uid = decoded["uid"]
    doc = db.collection("users").document(uid).get()
    if not doc.exists:
        raise HTTPException(status_code=404, detail="Profile not found")

    user_data = doc.to_dict() or {}
    _, access_token, github_username = _load_github_auth(decoded)

    cache_key = f"q={q or ''}|per_page={per_page}|gh={github_username.lower()}"
    cache_ref = _ai_cache_ref(uid, "recommendations", cache_key)
    now = datetime.now(timezone.utc)

    if not force_refresh:
        cache_doc = cache_ref.get()
        if cache_doc.exists:
            cache_data = cache_doc.to_dict() or {}
            cached_payload = cache_data.get("payload")
            previous_signature = str(cache_data.get("signature") or "")
            if isinstance(cached_payload, dict):
                try:
                    cached_response = AiRecommendationsResponse(**cached_payload)
                    last_checked = _parse_iso_datetime(cache_data.get("last_checked_at"))
                    if not last_checked:
                        last_checked = _parse_iso_datetime(cache_data.get("updated_at"))
                    if not last_checked or (now - last_checked).total_seconds() >= AI_RECOMMENDATIONS_TTL_SECONDS:
                        asyncio.create_task(
                            _refresh_recommendations_cache(
                                cache_ref,
                                user_data,
                                access_token,
                                github_username,
                                q,
                                per_page,
                                previous_signature,
                            )
                        )
                    return cached_response
                except Exception:
                    pass

    fresh = await _build_ai_recommendations(user_data, access_token, github_username, q, per_page)
    payload = fresh.model_dump(mode="json")
    signature = _payload_signature(payload)
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
    return fresh


@router.get("/repo-intel/brief/{owner}/{repo}", response_model=AiRepoBriefResponse)
async def get_repo_intel_brief(
    owner: str,
    repo: str,
    force_refresh: bool = Query(default=False),
    decoded: dict = Depends(verify_firebase_token),
):
    uid = decoded["uid"]
    full_name = f"{owner}/{repo}"
    _, access_token, github_username = _load_github_auth(decoded)
    profile_markdown = _read_profile_markdown(github_username)

    cache_ref = _ai_cache_ref(uid, "repo_brief", full_name.lower())
    now = datetime.now(timezone.utc)

    if not force_refresh:
        cache_doc = cache_ref.get()
        if cache_doc.exists:
            cache_data = cache_doc.to_dict() or {}
            cached_payload = cache_data.get("payload")
            previous_signature = str(cache_data.get("signature") or "")
            if isinstance(cached_payload, dict):
                try:
                    cached_response = AiRepoBriefResponse(**cached_payload)
                    last_checked = _parse_iso_datetime(cache_data.get("last_checked_at"))
                    if not last_checked:
                        last_checked = _parse_iso_datetime(cache_data.get("updated_at"))
                    if not last_checked or (now - last_checked).total_seconds() >= AI_REPO_INTEL_TTL_SECONDS:
                        asyncio.create_task(
                            _refresh_repo_brief_cache(
                                cache_ref,
                                full_name,
                                access_token,
                                profile_markdown,
                                previous_signature,
                            )
                        )
                    return cached_response
                except Exception:
                    pass

    fresh = await _build_repo_brief(full_name, access_token, profile_markdown)
    payload = fresh.model_dump(mode="json")
    signature = _payload_signature(payload)
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
    return fresh


@router.get("/repo-intel/deep/{owner}/{repo}", response_model=AiRepoDeepDiveResponse)
async def get_repo_intel_deep(
    owner: str,
    repo: str,
    force_refresh: bool = Query(default=False),
    decoded: dict = Depends(verify_firebase_token),
):
    uid = decoded["uid"]
    full_name = f"{owner}/{repo}"
    _, access_token, github_username = _load_github_auth(decoded)
    profile_markdown = _read_profile_markdown(github_username)

    cache_ref = _ai_cache_ref(uid, "repo_deep", f"{full_name.lower()}:{REPO_TREE_FORMAT_VERSION}")
    now = datetime.now(timezone.utc)

    if not force_refresh:
        cache_doc = cache_ref.get()
        if cache_doc.exists:
            cache_data = cache_doc.to_dict() or {}
            cached_payload = cache_data.get("payload")
            previous_signature = str(cache_data.get("signature") or "")
            if isinstance(cached_payload, dict):
                try:
                    cached_response = AiRepoDeepDiveResponse(**cached_payload)
                    last_checked = _parse_iso_datetime(cache_data.get("last_checked_at"))
                    if not last_checked:
                        last_checked = _parse_iso_datetime(cache_data.get("updated_at"))
                    if not last_checked or (now - last_checked).total_seconds() >= AI_REPO_INTEL_TTL_SECONDS:
                        asyncio.create_task(
                            _refresh_repo_deep_cache(
                                cache_ref,
                                full_name,
                                access_token,
                                profile_markdown,
                                previous_signature,
                            )
                        )
                    return cached_response
                except Exception:
                    pass

    fresh = await _build_repo_deep(full_name, access_token, profile_markdown)
    payload = fresh.model_dump(mode="json")
    signature = _payload_signature(payload)
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
    return fresh