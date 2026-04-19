import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';
import { firstValueFrom } from 'rxjs';

export interface AiFeaturedSection {
  name: string;
  summary: string;
  tags: string[];
  meta: string;
}

export interface AiRepoRecommendation {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  description: string;
  language: string | null;
  stars: number;
  open_issues: number;
  html_url: string;
  match_probability: number;
  reason: string;
  tags: string[];
  difficulty: string;
}

export interface AiRecommendationsResponse {
  focus_area: string;
  match_percent: number;
  profile_tags: string[];
  featured_sections: AiFeaturedSection[];
  recommendations: AiRepoRecommendation[];
}

export interface AiRepoBriefResponse {
  full_name: string;
  html_url: string;
  description: string | null;
  language: string | null;
  stars: number;
  open_issues: number;
  summary: string;
  why_contribute: string;
  contribution_value: string[];
  caution_notes: string[];
  profile_alignment: number;
}

export interface AiRepoIssueTarget {
  number: number;
  title: string;
  url: string;
  state: string;
  labels: string[];
  difficulty: string;
  reason: string;
  match_score: number;
}

export interface AiRepoDeepDiveResponse {
  full_name: string;
  html_url: string;
  default_branch: string;
  docs_summary: string;
  quick_start: string[];
  architecture_notes: string[];
  tree_lines: string[];
  target_issues: AiRepoIssueTarget[];
}

type CachedEntry<T> = {
  cachedAt: number;
  data: T;
};

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);
  private readonly recommendationsTtlMs = 5 * 60 * 1000;
  private readonly repoIntelTtlMs = 10 * 60 * 1000;

  private async buildAuthHeaders(): Promise<HttpHeaders> {
    const token = await this.authService.getIdToken();
    if (!token) {
      throw new Error('Authentication required before requesting AI recommendations.');
    }
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  private readCache<T>(key: string, ttlMs: number): T | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as CachedEntry<T>;
      if (!parsed || typeof parsed.cachedAt !== 'number') {
        return null;
      }

      if (Date.now() - parsed.cachedAt > ttlMs) {
        return null;
      }

      return parsed.data;
    } catch {
      return null;
    }
  }

  private writeCache<T>(key: string, data: T): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const payload: CachedEntry<T> = { cachedAt: Date.now(), data };
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // Best-effort cache.
    }
  }

  private recommendationsCacheKey(query?: string, perPage = 12): string {
    return `rr:ai:recommendations:${(query || '').trim().toLowerCase()}:${perPage}`;
  }

  private repoBriefCacheKey(owner: string, repo: string): string {
    return `rr:ai:repo-brief:${owner.toLowerCase()}/${repo.toLowerCase()}`;
  }

  private repoDeepCacheKey(owner: string, repo: string): string {
    return `rr:ai:repo-deep:${owner.toLowerCase()}/${repo.toLowerCase()}`;
  }

  async getRecommendations(
    query?: string,
    perPage = 12,
    options?: { forceRefresh?: boolean }
  ): Promise<AiRecommendationsResponse> {
    const forceRefresh = options?.forceRefresh ?? false;
    const cacheKey = this.recommendationsCacheKey(query, perPage);

    if (!forceRefresh) {
      const cached = this.readCache<AiRecommendationsResponse>(cacheKey, this.recommendationsTtlMs);
      if (cached) {
        this.fetchRecommendations(query, perPage, false).catch((error) => console.error(error));
        return cached;
      }
    }

    return this.fetchRecommendations(query, perPage, forceRefresh);
  }

  async getRepoBrief(
    owner: string,
    repo: string,
    options?: { forceRefresh?: boolean }
  ): Promise<AiRepoBriefResponse> {
    const forceRefresh = options?.forceRefresh ?? false;
    const cacheKey = this.repoBriefCacheKey(owner, repo);

    if (!forceRefresh) {
      const cached = this.readCache<AiRepoBriefResponse>(cacheKey, this.repoIntelTtlMs);
      if (cached) {
        this.fetchRepoBrief(owner, repo, false).catch((error) => console.error(error));
        return cached;
      }
    }

    return this.fetchRepoBrief(owner, repo, forceRefresh);
  }

  async getRepoDeepDive(
    owner: string,
    repo: string,
    options?: { forceRefresh?: boolean }
  ): Promise<AiRepoDeepDiveResponse> {
    const forceRefresh = options?.forceRefresh ?? false;
    const cacheKey = this.repoDeepCacheKey(owner, repo);

    if (!forceRefresh) {
      const cached = this.readCache<AiRepoDeepDiveResponse>(cacheKey, this.repoIntelTtlMs);
      if (cached) {
        this.fetchRepoDeepDive(owner, repo, false).catch((error) => console.error(error));
        return cached;
      }
    }

    return this.fetchRepoDeepDive(owner, repo, forceRefresh);
  }

  private async fetchRecommendations(
    query: string | undefined,
    perPage: number,
    forceRefresh: boolean,
  ): Promise<AiRecommendationsResponse> {
    const headers = await this.buildAuthHeaders();
    const params: Record<string, string | number> = {
      per_page: perPage,
      force_refresh: forceRefresh ? 'true' : 'false',
    };
    if (query?.trim()) {
      params['q'] = query.trim();
    }

    const data = await firstValueFrom(
      this.http.get<AiRecommendationsResponse>(`${environment.apiUrl}/ai/recommendations`, { headers, params })
    );

    this.writeCache(this.recommendationsCacheKey(query, perPage), data);
    return data;
  }

  private async fetchRepoBrief(owner: string, repo: string, forceRefresh: boolean): Promise<AiRepoBriefResponse> {
    const headers = await this.buildAuthHeaders();
    const params: Record<string, string> = {
      force_refresh: forceRefresh ? 'true' : 'false',
    };

    const data = await firstValueFrom(
      this.http.get<AiRepoBriefResponse>(`${environment.apiUrl}/ai/repo-intel/brief/${owner}/${repo}`, {
        headers,
        params,
      })
    );

    this.writeCache(this.repoBriefCacheKey(owner, repo), data);
    return data;
  }

  private async fetchRepoDeepDive(owner: string, repo: string, forceRefresh: boolean): Promise<AiRepoDeepDiveResponse> {
    const headers = await this.buildAuthHeaders();
    const params: Record<string, string> = {
      force_refresh: forceRefresh ? 'true' : 'false',
    };

    const data = await firstValueFrom(
      this.http.get<AiRepoDeepDiveResponse>(`${environment.apiUrl}/ai/repo-intel/deep/${owner}/${repo}`, {
        headers,
        params,
      })
    );

    this.writeCache(this.repoDeepCacheKey(owner, repo), data);
    return data;
  }

  toOwnerRepo(fullName: string): { owner: string; repo: string } {
    const [owner, ...repoParts] = (fullName || '').split('/');
    const repo = repoParts.join('/');
    if (!owner || !repo) {
      throw new Error('Invalid repository name format. Expected owner/repo.');
    }

    return { owner, repo };
  }
}
