import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  AlertCircle,
  Bookmark,
  ExternalLink,
  FolderGit2,
  LucideAngularModule,
  RefreshCw,
  Search,
  Star,
  Trash2,
} from 'lucide-angular';

import { Sidebar } from '../../components/sidebar/sidebar';
import { GitHubDataService, GitHubSavedRepo } from '../../services/github-data.service';

@Component({
  selector: 'app-saved',
  imports: [CommonModule, FormsModule, LucideAngularModule, Sidebar],
  templateUrl: './saved.html',
  styleUrl: './saved.css',
})
export class Saved implements OnInit {
  readonly Search = Search;
  readonly RefreshCw = RefreshCw;
  readonly ExternalLink = ExternalLink;
  readonly Trash2 = Trash2;
  readonly Star = Star;
  readonly AlertCircle = AlertCircle;
  readonly Bookmark = Bookmark;
  readonly FolderGit2 = FolderGit2;

  isLoading = false;
  loadError = '';
  searchQuery = '';

  savedRepos: GitHubSavedRepo[] = [];

  private readonly githubDataService = inject(GitHubDataService);

  async ngOnInit(): Promise<void> {
    await this.loadSavedRepos();
  }

  get filteredRepos(): GitHubSavedRepo[] {
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return this.savedRepos;
    }

    return this.savedRepos.filter((repo) => {
      const haystack = [
        repo.name,
        repo.full_name,
        repo.owner,
        repo.description || '',
        repo.language || '',
        ...(repo.tags || []),
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(query);
    });
  }

  async loadSavedRepos(): Promise<void> {
    this.isLoading = true;
    this.loadError = '';
    try {
      this.savedRepos = await this.githubDataService.getSavedRepos();
    } catch (error) {
      console.error(error);
      this.loadError = 'Unable to load saved repositories right now.';
    } finally {
      this.isLoading = false;
    }
  }

  async removeRepo(repoId: number): Promise<void> {
    const previous = [...this.savedRepos];
    this.savedRepos = this.savedRepos.filter((repo) => repo.id !== repoId);

    try {
      this.savedRepos = await this.githubDataService.removeSavedRepo(repoId);
    } catch (error) {
      console.error(error);
      this.savedRepos = previous;
      this.loadError = 'Could not remove that repository from saved list.';
    }
  }

  formatCompactNumber(value: number): string {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value || 0);
  }

  formatSavedAt(value?: string | null): string {
    if (!value) {
      return 'Saved recently';
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return 'Saved recently';
    }

    const hours = Math.max(1, Math.round((Date.now() - date.getTime()) / 3600000));
    if (hours < 24) {
      return `Saved ${hours}h ago`;
    }

    const days = Math.round(hours / 24);
    if (days < 7) {
      return `Saved ${days}d ago`;
    }

    return `Saved ${new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(date)}`;
  }

}
