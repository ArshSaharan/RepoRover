import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService, GitHubStats } from './auth.service';

export interface GitHubDiscoveryCategory {
  name: string;
  language: string;
  meta: string;
}

export interface GitHubDiscoveryRepo {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  description: string | null;
  language: string | null;
  stars: number;
  open_issues: number;
  html_url: string;
  tags: string[];
  match_score: number;
  difficulty: 'Easy' | 'Medium' | 'Hard' | string;
}

export interface GitHubTrendingRepo {
  name: string;
  full_name: string;
  language: string | null;
  stars: number;
  html_url: string;
  rank: string;
}

export interface GitHubDiscoveryResponse {
  focus_area: string;
  match_percent: number;
  categories: GitHubDiscoveryCategory[];
  repos: GitHubDiscoveryRepo[];
  trending: GitHubTrendingRepo[];
}

export interface GitHubContributionDay {
  date: string;
  count: number;
  level: number;
}

export interface GitHubContributionWeek {
  first_day: string;
  days: GitHubContributionDay[];
}

export interface GitHubRecentContribution {
  id: number;
  repo: string;
  title: string;
  status: 'MERGED' | 'OPEN' | 'CLOSED' | string;
  url: string;
  occurred_at: string;
  additions: number;
  deletions: number;
}

export interface GitHubContributionsResponse {
  username: string;
  name: string | null;
  avatar_url: string | null;
  total_contributions: number;
  last_weeks_total: number;
  total_prs: number;
  merged_prs: number;
  lines_changed: number;
  heatmap_weeks: GitHubContributionWeek[];
  recent: GitHubRecentContribution[];
}

export interface GitHubSavedRepo {
  id: number;
  name: string;
  full_name: string;
  owner: string;
  description: string | null;
  language: string | null;
  stars: number;
  open_issues: number;
  html_url: string;
  tags: string[];
  difficulty: string;
  saved_at?: string | null;
}

export interface GitHubSavedReposResponse {
  repos: GitHubSavedRepo[];
}

type ContributionCacheEntry = {
  cachedAt: number;
  data: GitHubContributionsResponse;
};

@Injectable({
  providedIn: 'root'
})
export class GitHubDataService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);
  private readonly contributionCacheTtlMs = 5 * 60 * 1000;

  async getGitHubProfile(): Promise<GitHubStats | null> {
    return this.authService.getGitHubProfile();
  }

  private async buildAuthHeaders(): Promise<HttpHeaders> {
    const token = await this.authService.getIdToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  async getDiscovery(query?: string, perPage = 12): Promise<GitHubDiscoveryResponse> {
    const headers = await this.buildAuthHeaders();
    const params: Record<string, string | number> = { per_page: perPage };
    if (query?.trim()) {
      params['q'] = query.trim();
    }

    return firstValueFrom(
      this.http.get<GitHubDiscoveryResponse>(`${environment.apiUrl}/auth/github/discover`, {
        headers,
        params,
      })
    );
  }

  getCachedContributions(weeks = 14, recentLimit = 4): GitHubContributionsResponse | null {
    if (typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const raw = localStorage.getItem(this.contributionCacheKey(weeks, recentLimit));
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw) as ContributionCacheEntry;
      if (!parsed?.data || typeof parsed.cachedAt !== 'number') {
        return null;
      }

      if (Date.now() - parsed.cachedAt > this.contributionCacheTtlMs) {
        return null;
      }

      return parsed.data;
    } catch {
      return null;
    }
  }

  async getContributions(
    weeks = 14,
    recentLimit = 4,
    options?: { forceRefresh?: boolean }
  ): Promise<GitHubContributionsResponse> {
    const forceRefresh = options?.forceRefresh ?? false;
    if (!forceRefresh) {
      const cached = this.getCachedContributions(weeks, recentLimit);
      if (cached) {
        // Refresh cached entry in the background without blocking UI.
        this.fetchContributions(weeks, recentLimit, false).catch((error) => console.error(error));
        return cached;
      }
    }

    return this.fetchContributions(weeks, recentLimit, forceRefresh);
  }

  async getSavedRepos(): Promise<GitHubSavedRepo[]> {
    const headers = await this.buildAuthHeaders();
    const response = await firstValueFrom(
      this.http.get<GitHubSavedReposResponse>(`${environment.apiUrl}/users/me/saved-repos`, {
        headers,
      })
    );

    return response.repos || [];
  }

  async saveRepo(repo: GitHubSavedRepo): Promise<GitHubSavedRepo[]> {
    const headers = await this.buildAuthHeaders();
    const response = await firstValueFrom(
      this.http.post<GitHubSavedReposResponse>(`${environment.apiUrl}/users/me/saved-repos`, repo, {
        headers,
      })
    );

    return response.repos || [];
  }

  async removeSavedRepo(repoId: number): Promise<GitHubSavedRepo[]> {
    const headers = await this.buildAuthHeaders();
    const response = await firstValueFrom(
      this.http.delete<GitHubSavedReposResponse>(`${environment.apiUrl}/users/me/saved-repos/${repoId}`, {
        headers,
      })
    );

    return response.repos || [];
  }

  private async fetchContributions(
    weeks: number,
    recentLimit: number,
    forceRefresh: boolean,
  ): Promise<GitHubContributionsResponse> {
    const headers = await this.buildAuthHeaders();
    const params: Record<string, string | number> = {
      weeks,
      recent_limit: recentLimit,
    };
    if (forceRefresh) {
      params['force_refresh'] = 'true';
    }

    const data = await firstValueFrom(
      this.http.get<GitHubContributionsResponse>(`${environment.apiUrl}/auth/github/contributions`, {
        headers,
        params,
      })
    );

    this.setCachedContributions(weeks, recentLimit, data);
    return data;
  }

  private contributionCacheKey(weeks: number, recentLimit: number): string {
    return `rr:contrib:${weeks}:${recentLimit}`;
  }

  private setCachedContributions(weeks: number, recentLimit: number, data: GitHubContributionsResponse): void {
    if (typeof localStorage === 'undefined') {
      return;
    }

    try {
      const entry: ContributionCacheEntry = {
        cachedAt: Date.now(),
        data,
      };
      localStorage.setItem(this.contributionCacheKey(weeks, recentLimit), JSON.stringify(entry));
    } catch {
      // Ignore storage issues (private mode / quota exceeded).
    }
  }
}