import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { LucideAngularModule, Search, Bell, TrendingUp, Star, Zap, Filter, ChevronRight } from 'lucide-angular';
import { Sidebar } from '../../components/sidebar/sidebar';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiFeaturedSection, AiRepoRecommendation, AiService } from '../../services/ai.service';

@Component({
  selector: 'app-explore',
  imports: [LucideAngularModule, Sidebar, CommonModule, FormsModule],
  templateUrl: './explore.html',
  styleUrl: './explore.css',
})
export class Explore implements OnInit {
  readonly Search = Search;
  readonly Bell = Bell;
  readonly TrendingUp = TrendingUp;
  readonly Star = Star;
  readonly Zap = Zap;
  readonly Filter = Filter;
  readonly ChevronRight = ChevronRight;

  sortMode: 'relevance' | 'difficulty' = 'relevance';
  searchQuery = '';
  focusArea = 'Open Source';
  matchPercent = 0;
  profileTags: string[] = [];

  forgeCategories: Array<AiFeaturedSection & { emoji: string }> = [];

  repos: AiRepoRecommendation[] = [];
  isLoading = false;
  loadError = '';

  private aiService = inject(AiService);
  private router = inject(Router);

  trending: AiRepoRecommendation[] = [];

  async ngOnInit() {
    await this.loadRepos();
  }

  async loadRepos(forceRefresh = false) {
    this.isLoading = true;
    this.loadError = '';
    try {
      const normalizedQuery = this.searchQuery.trim();
      const response = await this.aiService.getRecommendations(
        normalizedQuery || undefined,
        12,
        { forceRefresh }
      );

      this.focusArea = response.focus_area;
      this.matchPercent = response.match_percent;
      this.profileTags = response.profile_tags;
      this.forgeCategories = response.featured_sections.map((section, index) => ({
        ...section,
        emoji: ['⚙️', '🚀', '🎨', '🧠'][index % 4],
      }));

      if (!this.forgeCategories.length) {
        this.forgeCategories = this.buildFallbackForges(response.recommendations);
      }

      this.repos = response.recommendations;
      this.trending = [...response.recommendations]
        .sort((left, right) => right.match_probability - left.match_probability)
        .slice(0, 3);
    } catch (e: unknown) {
      console.error(e);
      this.loadError = 'Failed to load repositories from the backend.';
    } finally {
      this.isLoading = false;
    }
  }

  async runSearch(forceRefresh = true): Promise<void> {
    await this.loadRepos(forceRefresh);
  }

  async applyForgeFilter(section: AiFeaturedSection): Promise<void> {
    const nextQuery = section.tags?.[0] || section.name || section.meta || this.searchQuery;
    this.searchQuery = (nextQuery || '').trim();
    await this.loadRepos(true);
  }

  onSearchShortcut(event: Event): void {
    event.preventDefault();
    this.runSearch(true).catch((error) => console.error(error));
  }

  private buildFallbackForges(recommendations: AiRepoRecommendation[]): Array<AiFeaturedSection & { emoji: string }> {
    const buckets = new Map<string, AiRepoRecommendation[]>();

    for (const repo of recommendations) {
      const key = (repo.language || 'Open Source').toUpperCase();
      const list = buckets.get(key) || [];
      list.push(repo);
      buckets.set(key, list);
    }

    return Array.from(buckets.entries())
      .slice(0, 4)
      .map(([language, repos], index) => {
        const tags = Array.from(
          new Set(
            repos
              .flatMap((repo) => repo.tags || [])
              .map((tag) => (tag || '').trim())
              .filter(Boolean)
          )
        ).slice(0, 3);

        return {
          name: `${language} Track`,
          summary: `Recommended ${language} repositories based on your current profile signals.`,
          meta: `From ${repos.length} matched repositories`,
          tags: tags.length ? tags : [language.toLowerCase()],
          emoji: ['⚙️', '🚀', '🎨', '🧠'][index % 4],
        };
      });
  }

  get sortedRepos(): AiRepoRecommendation[] {
    const repos = [...this.repos];
    if (this.sortMode === 'difficulty') {
      const rank: Record<string, number> = { Easy: 1, Medium: 2, Hard: 3 };
      return repos.sort((left, right) => (rank[left.difficulty] || 99) - (rank[right.difficulty] || 99));
    }

    return repos.sort((left, right) => (right.match_probability - left.match_probability) || (right.stars - left.stars));
  }

  getLangClass(lang: string): string {
    const map: Record<string, string> = { typescript: 'ts', javascript: 'ts', python: 'py', rust: 'rs', go: 'gfi', java: 'bug' };
    return map[lang] || 'ts';
  }

  getTagClass(tag: string): string {
    if (tag.includes('first')) return 'gfi';
    if (tag === 'bug') return 'bug';
    if (tag === 'feature') return 'feat';
    if (tag === 'core') return 'ts';
    if (tag === 'ai' || tag === 'open-source') return 'feat';
    return 'docs';
  }

  matchColor(match: number): string {
    if (match >= 95) return '#22c55e';
    if (match >= 85) return '#f97316';
    return '#eab308';
  }

  formatCompactNumber(value: number): string {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }

  openContribution(fullName: string): void {
    const [owner, ...repoParts] = (fullName || '').split('/');
    const repo = repoParts.join('/');
    if (!owner || !repo) {
      return;
    }

    this.router.navigate(['/contribute', owner, repo]);
  }
}
