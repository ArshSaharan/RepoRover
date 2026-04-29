import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  Activity,
  Bookmark,
  Compass,
  ExternalLink,
  GitMerge,
  GitPullRequest,
  LayoutDashboard,
  LucideAngularModule,
  Search,
  Trash2,
  User,
} from 'lucide-angular';

import { Sidebar } from '../../components/sidebar/sidebar';
import {
  GitHubContributionDay,
  GitHubContributionWeek,
  GitHubContributionsResponse,
  GitHubDataService,
  GitHubRecentContribution,
} from '../../services/github-data.service';
import {
  ContributionCreate,
  ContributionService,
  ManualContribution,
} from '../../services/contribution.service';

@Component({
  selector: 'app-contributions',
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive, LucideAngularModule, Sidebar],
  templateUrl: './contributions.html',
  styleUrl: './contributions.css',
})
export class Contributions implements OnInit {
  readonly Search = Search;
  readonly GitPullRequest = GitPullRequest;
  readonly GitMerge = GitMerge;
  readonly Activity = Activity;
  readonly LayoutDashboard = LayoutDashboard;
  readonly Compass = Compass;
  readonly Bookmark = Bookmark;
  readonly User = User;
  readonly ExternalLink = ExternalLink;
  readonly Trash2 = Trash2;

  readonly weeks = 14;

  isLoading = false;
  loadError = '';

  displayName = 'Developer';
  username = 'dev';
  avatarUrl: string | null = null;

  totalContributions = 0;
  totalPrs = 0;
  mergedPrs = 0;
  linesChanged = 0;
  windowContributions = 0;
  momentumLabel = 'Activity window: last 14 weeks';

  heatmapWeeks: GitHubContributionWeek[] = [];
  monthMarkers: string[] = [];
  recentContributions: GitHubRecentContribution[] = [];

  manualContributions: ManualContribution[] = [];
  manualLoadError = '';
  manualLoading = false;
  isSavingManual = false;
  deletingId: string | null = null;

  contributionForm: ContributionCreate = {
    title: '',
    description: '',
    category: 'PR',
    project: '',
    url: '',
    tags: [],
    occurred_at: '',
  };
  tagsInput = '';
  categoryOptions = ['PR', 'Issue', 'Blog', 'Talk', 'Review', 'Documentation', 'Mentoring', 'Other'];

  private readonly githubDataService = inject(GitHubDataService);
  private readonly contributionService = inject(ContributionService);

  async ngOnInit(): Promise<void> {
    await Promise.all([
      this.loadContributions(),
      this.loadManualContributions(),
    ]);
  }

  async loadContributions(forceRefresh = false): Promise<void> {
    this.isLoading = true;
    this.loadError = '';

    try {
      const response = await this.githubDataService.getContributions(this.weeks, 4, { forceRefresh });
      this.applyContributionData(response);
    } catch (error) {
      console.error(error);
      this.loadError = 'Unable to load GitHub contributions right now.';
    } finally {
      this.isLoading = false;
    }
  }

  async loadManualContributions(): Promise<void> {
    this.manualLoading = true;
    this.manualLoadError = '';
    try {
      this.manualContributions = await this.contributionService.getManualContributions();
    } catch (error) {
      console.error(error);
      this.manualLoadError = 'Unable to load manual contributions right now.';
    } finally {
      this.manualLoading = false;
    }
  }

  async submitManualContribution(): Promise<void> {
    if (!this.contributionForm.title?.trim()) {
      this.manualLoadError = 'Please enter a contribution title.';
      return;
    }

    this.isSavingManual = true;
    this.manualLoadError = '';

    try {
      const tags = this.tagsInput
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

      const payload: ContributionCreate = {
        ...this.contributionForm,
        title: this.contributionForm.title?.trim() || '',
        description: this.contributionForm.description?.trim() || undefined,
        project: this.contributionForm.project?.trim() || undefined,
        url: this.contributionForm.url?.trim() || undefined,
        occurred_at: this.contributionForm.occurred_at || undefined,
        tags,
      };

      await this.contributionService.addContribution(payload);
      await this.loadManualContributions();

      this.contributionForm = {
        title: '',
        description: '',
        category: this.contributionForm.category || 'PR',
        project: '',
        url: '',
        tags: [],
        occurred_at: '',
      };
      this.tagsInput = '';
    } catch (error) {
      console.error(error);
      this.manualLoadError = 'Unable to save contribution right now.';
    } finally {
      this.isSavingManual = false;
    }
  }

  async deleteManualContribution(entry: ManualContribution): Promise<void> {
    if (!confirm(`Delete "${entry.title}"?`)) {
      return;
    }

    this.deletingId = entry.id;
    this.manualLoadError = '';
    try {
      await this.contributionService.deleteContribution(entry.id);
      this.manualContributions = this.manualContributions.filter((item) => item.id !== entry.id);
    } catch (error) {
      console.error(error);
      this.manualLoadError = 'Unable to delete contribution right now.';
    } finally {
      this.deletingId = null;
    }
  }

  get mergeRate(): string {
    if (this.totalPrs <= 0) {
      return '0% merge rate';
    }

    const rate = Math.round((this.mergedPrs / this.totalPrs) * 100);
    return `${rate}% merge rate`;
  }

  formatCompactNumber(value: number): string {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }

  heatmapClass(level: number): string {
    const normalized = Math.max(0, Math.min(4, level));
    return `level-${normalized}`;
  }

  heatmapTitle(day: GitHubContributionDay): string {
    if (!day.date) {
      return 'No contribution data';
    }

    const formattedDate = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(day.date));
    const suffix = day.count === 1 ? '' : 's';
    return `${formattedDate}: ${day.count} contribution${suffix}`;
  }

  statusClass(status: string): string {
    switch (status.toUpperCase()) {
      case 'MERGED':
        return 'status-merged';
      case 'OPEN':
        return 'status-open';
      default:
        return 'status-closed';
    }
  }

  formatRelativeTime(value: string): string {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return 'Recently';
    }

    const diffMs = Date.now() - parsed.getTime();
    const diffHours = Math.max(1, Math.round(diffMs / 3600000));
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    if (diffHours < 48) {
      return 'Yesterday';
    }

    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(parsed);
  }

  formatManualDate(value?: string | null): string {
    if (!value) {
      return 'Recently';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return 'Recently';
    }
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(parsed);
  }

  private applyContributionData(data: GitHubContributionsResponse): void {
    this.displayName = data.name || data.username;
    this.username = data.username;
    this.avatarUrl = data.avatar_url;

    this.totalContributions = data.total_contributions;
    this.totalPrs = data.total_prs;
    this.mergedPrs = data.merged_prs;
    this.linesChanged = data.lines_changed;
    this.windowContributions = data.last_weeks_total;

    this.heatmapWeeks = data.heatmap_weeks;
    this.monthMarkers = this.buildMonthMarkers(this.heatmapWeeks);
    this.momentumLabel = this.buildMomentumLabel(this.heatmapWeeks);

    this.recentContributions = data.recent;
  }

  private buildMonthMarkers(weeks: GitHubContributionWeek[]): string[] {
    const markers: string[] = [];
    let previousMonth = '';

    for (const week of weeks) {
      const firstDate = (week.days.find((day) => !!day.date)?.date || week.first_day).trim();
      if (!firstDate) {
        markers.push('');
        continue;
      }

      const month = new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(firstDate));
      if (month !== previousMonth) {
        markers.push(month);
        previousMonth = month;
      } else {
        markers.push('');
      }
    }

    return markers;
  }

  private buildMomentumLabel(weeks: GitHubContributionWeek[]): string {
    const weeklyTotals = weeks.map((week) => week.days.reduce((sum, day) => sum + day.count, 0));
    if (!weeklyTotals.length) {
      return 'Activity window: last 14 weeks';
    }

    const split = Math.floor(weeklyTotals.length / 2);
    const firstHalf = weeklyTotals.slice(0, split).reduce((sum, count) => sum + count, 0);
    const secondHalf = weeklyTotals.slice(split).reduce((sum, count) => sum + count, 0);

    if (firstHalf <= 0 && secondHalf <= 0) {
      return 'No activity in this window';
    }

    if (firstHalf <= 0) {
      return '+100% vs previous period';
    }

    const delta = Math.round(((secondHalf - firstHalf) / firstHalf) * 100);
    const prefix = delta > 0 ? '+' : '';
    return `${prefix}${delta}% vs previous period`;
  }
}
