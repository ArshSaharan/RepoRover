import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  LucideAngularModule, Search, Bell, TrendingUp, Zap, Star,
  Bookmark, ArrowUpRight, Activity, ExternalLink, GitMerge,
  AlertCircle, BarChart2
} from 'lucide-angular';
import { CommonModule } from '@angular/common';
import { Sidebar } from '../../components/sidebar/sidebar';
import { Onboarding } from '../../components/onboarding/onboarding';
import { AuthService } from '../../services/auth.service';
import { GitHubDataService } from '../../services/github-data.service';
import { AiRepoRecommendation, AiService } from '../../services/ai.service';

type DashboardRecommendation = {
  id: number;
  name: string;
  fullName: string;
  language: string;
  owner: string;
  match: number;
  desc: string;
  reason: string;
  tags: string[];
  url: string;
  stars: number;
  openIssues: number;
  difficulty: string;
  saved: boolean;
};

type DashboardActivity = {
  time: string;
  title: string;
  sub: string;
  url: string;
};

@Component({
  selector: 'app-dashboard',
  imports: [LucideAngularModule, CommonModule, Sidebar, Onboarding],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard implements OnInit {
  readonly Search = Search;
  readonly Bell = Bell;
  readonly TrendingUp = TrendingUp;
  readonly Zap = Zap;
  readonly Star = Star;
  readonly Bookmark = Bookmark;
  readonly ArrowUpRight = ArrowUpRight;
  readonly Activity = Activity;
  readonly ExternalLink = ExternalLink;
  readonly GitMerge = GitMerge;
  readonly AlertCircle = AlertCircle;
  readonly BarChart2 = BarChart2;

  showOnboarding;
  isLoading = false;
  loadError = '';
  focusArea = 'Open Source';

  private githubDataService = inject(GitHubDataService);
  private aiService = inject(AiService);
  private router = inject(Router);

  constructor(public authService: AuthService) {
    this.showOnboarding = this.authService.isNewUser;
  }

  stats = [
    { label: 'PUBLIC REPOS', value: '0', delta: null, deltaLabel: 'Connected from GitHub', icon: Zap, positive: true },
    { label: 'MATCH ACCURACY', value: '0%', delta: null, deltaLabel: 'Derived from your GitHub stack', icon: BarChart2, positive: true },
    { label: 'OPEN ISSUES', value: '0', delta: null, deltaLabel: 'Across recommended repositories', icon: AlertCircle, positive: null },
  ];

  recommendations: DashboardRecommendation[] = [];
  attentionRepos: AiRepoRecommendation[] = [];
  liveActivity: DashboardActivity[] = [];

  async ngOnInit() {
    await this.loadDashboard();
  }

  async loadDashboard() {
    this.isLoading = true;
    this.loadError = '';
    try {
      const [profile, aiResponse, savedRepos] = await Promise.all([
        this.githubDataService.getGitHubProfile(),
        this.aiService.getRecommendations(undefined, 12),
        this.githubDataService.getSavedRepos(),
      ]);

      if (!profile) {
        throw new Error('GitHub profile is not available');
      }

      const savedIds = new Set(savedRepos.map((repo) => repo.id));

      this.focusArea = aiResponse.focus_area;
      this.stats = [
        {
          label: 'PUBLIC REPOS',
          value: this.formatCompactNumber(profile.public_repos),
          delta: null,
          deltaLabel: `${profile.followers} followers on GitHub`,
          icon: Zap,
          positive: true,
        },
        {
          label: 'MATCH ACCURACY',
          value: `${aiResponse.match_percent}%`,
          delta: null,
          deltaLabel: `Strongest fit: ${aiResponse.focus_area}`,
          icon: BarChart2,
          positive: true,
        },
        {
          label: 'OPEN ISSUES',
          value: this.formatCompactNumber(aiResponse.recommendations.reduce((sum, repo) => sum + repo.open_issues, 0)),
          delta: null,
          deltaLabel: `Across ${aiResponse.recommendations.length} Gemini-ranked repositories`,
          icon: AlertCircle,
          positive: null,
        },
      ];

      this.recommendations = aiResponse.recommendations.slice(0, 4).map((repo) => ({
        id: repo.id,
        name: repo.name,
        fullName: repo.full_name,
        language: repo.language || 'repo',
        owner: repo.owner,
        match: repo.match_probability,
        desc: repo.description || 'No repository description provided.',
        reason: repo.reason,
        tags: repo.tags,
        url: repo.html_url,
        stars: repo.stars,
        openIssues: repo.open_issues,
        difficulty: repo.difficulty,
        saved: savedIds.has(repo.id),
      }));

      this.attentionRepos = [...aiResponse.recommendations]
        .sort((left, right) => right.open_issues - left.open_issues)
        .slice(0, 5);

      this.liveActivity = (profile.repos || []).slice(0, 3).map((repo) => ({
        time: this.formatUpdatedAt(repo.updated_at),
        title: repo.full_name || repo.name,
        sub: `${repo.language || 'Unknown'} · ${this.formatCompactNumber(repo.stars || 0)} stars · ${repo.open_issues || 0} open issues`,
        url: repo.url || '#',
      }));
    } catch (e: unknown) {
      console.error(e);
      this.loadError = 'Could not load dashboard data from the backend.';
    } finally {
      this.isLoading = false;
    }
  }

  async toggleSave(i: number) {
    const repo = this.recommendations[i];
    const previousState = repo.saved;
    repo.saved = !repo.saved;

    try {
      if (repo.saved) {
        await this.githubDataService.saveRepo({
          id: repo.id,
          name: repo.name,
          full_name: repo.fullName,
          owner: repo.owner,
          description: repo.desc,
          language: repo.language === 'repo' ? null : repo.language,
          stars: repo.stars,
          open_issues: repo.openIssues,
          html_url: repo.url,
          tags: repo.tags,
          difficulty: repo.difficulty,
          saved_at: null,
        });
      } else {
        await this.githubDataService.removeSavedRepo(repo.id);
      }
    } catch (error) {
      console.error(error);
      repo.saved = previousState;
    }
  }

  matchColor(match: number): string {
    if (match >= 95) return '#22c55e';
    if (match >= 85) return '#f97316';
    return '#eab308';
  }

  openContribution(fullName: string) {
    const [owner, ...repoParts] = (fullName || '').split('/');
    const repo = repoParts.join('/');
    if (!owner || !repo) {
      return;
    }

    this.router.navigate(['/contribute', owner, repo]);
  }

  formatCompactNumber(value: number): string {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value);
  }

  formatUpdatedAt(updatedAt?: string): string {
    if (!updatedAt) {
      return 'Recently';
    }

    const diffHours = Math.max(1, Math.round((Date.now() - new Date(updatedAt).getTime()) / 3600000));
    if (diffHours < 24) {
      return `${diffHours}h ago`;
    }

    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) {
      return `${diffDays}d ago`;
    }

    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric' }).format(new Date(updatedAt));
  }
}
