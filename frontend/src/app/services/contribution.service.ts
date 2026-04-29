import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

export interface ContributionCreate {
  title: string;
  description?: string | null;
  category?: string;
  project?: string | null;
  url?: string | null;
  tags?: string[];
  occurred_at?: string | null;
}

export interface ManualContribution {
  id: string;
  title: string;
  description?: string | null;
  category: string;
  project?: string | null;
  url?: string | null;
  tags: string[];
  occurred_at?: string | null;
  created_at: string;
}

export interface ManualContributionsResponse {
  contributions: ManualContribution[];
}

@Injectable({
  providedIn: 'root'
})
export class ContributionService {
  private readonly http = inject(HttpClient);
  private readonly authService = inject(AuthService);

  private async buildAuthHeaders(): Promise<HttpHeaders> {
    const token = await this.authService.getIdToken();
    if (!token) {
      throw new Error('Authentication required');
    }

    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  async getManualContributions(): Promise<ManualContribution[]> {
    const headers = await this.buildAuthHeaders();
    const response = await firstValueFrom(
      this.http.get<ManualContributionsResponse>(`${environment.apiUrl}/users/me/contributions`, { headers })
    );

    return response.contributions || [];
  }

  async addContribution(payload: ContributionCreate): Promise<ManualContribution> {
    const headers = await this.buildAuthHeaders();
    return firstValueFrom(
      this.http.post<ManualContribution>(`${environment.apiUrl}/users/me/contributions`, payload, { headers })
    );
  }

  async deleteContribution(contribId: string): Promise<void> {
    const headers = await this.buildAuthHeaders();
    await firstValueFrom(
      this.http.delete(`${environment.apiUrl}/users/me/contributions/${contribId}`, { headers })
    );
  }
}
