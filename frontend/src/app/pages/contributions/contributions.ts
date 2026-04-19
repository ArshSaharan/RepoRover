import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
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

@Component({
  selector: 'app-contributions',
  imports: [CommonModule, RouterLink, RouterLinkActive, LucideAngularModule, Sidebar],
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

  private readonly githubDataService = inject(GitHubDataService);

  async ngOnInit(): Promise<void> {
    await this.loadContributions();
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
