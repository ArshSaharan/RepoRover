import { Component, OnInit, inject } from '@angular/core';
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

  trending: AiRepoRecommendation[] = [];

  async ngOnInit() {
    await this.loadRepos();
  }

  async loadRepos() {
    this.isLoading = true;
    this.loadError = '';
    try {
      const response = await this.aiService.getRecommendations(this.searchQuery || undefined, 12);
      this.focusArea = response.focus_area;
      this.matchPercent = response.match_percent;
      this.profileTags = response.profile_tags;
      this.forgeCategories = response.featured_sections.map((section, index) => ({
        ...section,
        emoji: ['⚙️', '🚀', '🎨', '🧠'][index % 4],
      }));
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
}
