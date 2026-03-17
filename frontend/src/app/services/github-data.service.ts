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

@Injectable({
  providedIn: 'root'
})
export class GitHubDataService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  async getGitHubProfile(): Promise<GitHubStats | null> {
    return this.authService.getGitHubProfile();
  }

  async getDiscovery(query?: string, perPage = 12): Promise<GitHubDiscoveryResponse> {
    const token = await this.authService.getIdToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    const headers = new HttpHeaders({ Authorization: `Bearer ${token}` });
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
}