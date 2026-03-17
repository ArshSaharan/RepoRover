import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
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

@Injectable({
  providedIn: 'root'
})
export class AiService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  async getRecommendations(query?: string, perPage = 12): Promise<AiRecommendationsResponse> {
    const token = await this.authService.getIdToken();
    if (!token) {
      throw new Error('Authentication required before requesting AI recommendations.');
    }
    const headers = { Authorization: `Bearer ${token}` };
    const params: Record<string, string | number> = { per_page: perPage };
    if (query?.trim()) {
      params['q'] = query.trim();
    }

    return firstValueFrom(
      this.http.get<AiRecommendationsResponse>(`${environment.apiUrl}/ai/recommendations`, { headers, params })
    );
  }
}
