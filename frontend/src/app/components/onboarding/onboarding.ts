import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  LucideAngularModule, User, Github, GitPullRequest, AlertCircle,
  FolderGit2, Star, ArrowRight, Check, Loader2, Zap, X, Link
} from 'lucide-angular';
import { AuthService, GitHubStats } from '../../services/auth.service';

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule],
  templateUrl: './onboarding.html',
  styleUrl: './onboarding.css',
})
export class Onboarding implements OnInit {
  readonly User = User;
  readonly Github = Github;
  readonly GitPullRequest = GitPullRequest;
  readonly AlertCircle = AlertCircle;
  readonly FolderGit2 = FolderGit2;
  readonly Star = Star;
  readonly ArrowRight = ArrowRight;
  readonly Check = Check;
  readonly Loader2 = Loader2;
  readonly Zap = Zap;
  readonly X = X;
  readonly Link = Link;

  step = signal<number>(1);
  displayName = '';
  skills = signal<string[]>([]);
  interests = signal<string[]>([]);
  isLoadingGitHub = signal<boolean>(false);
  githubStats = signal<GitHubStats | null>(null);
  isSaving = signal<boolean>(false);

  availableSkills = ['JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin', 'HTML', 'CSS', 'SQL', 'Shell'];
  availableInterests = ['Frontend', 'Backend', 'Full Stack', 'DevOps', 'Machine Learning', 'AI', 'Data Science', 'Mobile', 'iOS', 'Android', 'Game Dev', 'Security', 'Web3', 'Open Source'];

  toggleSkill(skill: string) {
    if (this.skills().includes(skill)) {
      this.skills.set(this.skills().filter(s => s !== skill));
    } else {
      this.skills.set([...this.skills(), skill]);
    }
  }

  toggleInterest(interest: string) {
    if (this.interests().includes(interest)) {
      this.interests.set(this.interests().filter(i => i !== interest));
    } else {
      this.interests.set([...this.interests(), interest]);
    }
  }

  isGitHubUser = computed(() => {
    const profile = this.authService.userProfile();
    return profile?.provider === 'github';
  });

  constructor(private authService: AuthService) {}

  ngOnInit(): void {
    // If GitHub user, auto-fetch profile data
    if (this.isGitHubUser()) {
      this.loadGitHubProfile();
    }

    // Pre-fill display name if available
    const profile = this.authService.userProfile();
    if (profile?.display_name) {
      this.displayName = profile.display_name;
    }
  }

  async loadGitHubProfile(): Promise<void> {
    this.isLoadingGitHub.set(true);
    try {
      const stats = await this.authService.fetchGitHubProfile();
      this.githubStats.set(stats);
      if (stats?.name && !this.displayName) {
        this.displayName = stats.name;
      }
    } catch (e) {
      console.error('Failed to load GitHub profile:', e);
    } finally {
      this.isLoadingGitHub.set(false);
    }
  }

  goToStep(n: number): void {
    this.step.set(n);
  }

  linkGitHub(): void {
    this.authService.linkGitHub();
  }

  async finish(): Promise<void> {
    if (!this.displayName.trim()) return;
    this.isSaving.set(true);
    try {
      const stats = this.githubStats();
      await this.authService.completeOnboarding(
        this.displayName.trim(),
        this.skills(),
        this.interests(),
        stats?.username || undefined,
      );
    } catch (e) {
      console.error('Failed to complete onboarding:', e);
    } finally {
      this.isSaving.set(false);
    }
  }
}
