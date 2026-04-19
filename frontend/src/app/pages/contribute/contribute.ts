import { CommonModule } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileCode2,
  FolderTree,
  LucideAngularModule,
  RefreshCw,
  Rocket,
  ShieldQuestion,
  Sparkles,
  Target,
} from 'lucide-angular';

import { Sidebar } from '../../components/sidebar/sidebar';
import {
  AiRepoBriefResponse,
  AiRepoDeepDiveResponse,
  AiService,
} from '../../services/ai.service';

@Component({
  selector: 'app-contribute',
  imports: [CommonModule, LucideAngularModule, Sidebar],
  templateUrl: './contribute.html',
  styleUrl: './contribute.css',
})
export class Contribute implements OnInit {
  readonly Sparkles = Sparkles;
  readonly RefreshCw = RefreshCw;
  readonly Rocket = Rocket;
  readonly FolderTree = FolderTree;
  readonly FileCode2 = FileCode2;
  readonly Target = Target;
  readonly ExternalLink = ExternalLink;
  readonly AlertCircle = AlertCircle;
  readonly CheckCircle2 = CheckCircle2;
  readonly ShieldQuestion = ShieldQuestion;

  owner = '';
  repo = '';
  fullName = '';

  brief: AiRepoBriefResponse | null = null;
  deep: AiRepoDeepDiveResponse | null = null;

  isLoadingBrief = false;
  isLoadingDeep = false;
  briefError = '';
  deepError = '';
  hasProceeded = false;

  private readonly route = inject(ActivatedRoute);
  private readonly aiService = inject(AiService);

  async ngOnInit(): Promise<void> {
    this.owner = this.route.snapshot.paramMap.get('owner') || '';
    this.repo = this.route.snapshot.paramMap.get('repo') || '';
    this.fullName = `${this.owner}/${this.repo}`;

    if (!this.owner || !this.repo) {
      this.briefError = 'Invalid repository route. Please open this page from Dashboard or Explore.';
      return;
    }

    await this.loadBrief();
  }

  async loadBrief(forceRefresh = false): Promise<void> {
    this.isLoadingBrief = true;
    this.briefError = '';

    try {
      this.brief = await this.aiService.getRepoBrief(this.owner, this.repo, { forceRefresh });
    } catch (error) {
      console.error(error);
      this.briefError = 'Could not generate repository brief right now.';
    } finally {
      this.isLoadingBrief = false;
    }
  }

  async proceedWithContribution(forceRefresh = false): Promise<void> {
    this.hasProceeded = true;
    if (this.deep && !forceRefresh) {
      return;
    }

    this.isLoadingDeep = true;
    this.deepError = '';

    try {
      this.deep = await this.aiService.getRepoDeepDive(this.owner, this.repo, { forceRefresh });
    } catch (error) {
      console.error(error);
      this.deepError = 'Could not load deep project analysis right now.';
    } finally {
      this.isLoadingDeep = false;
    }
  }

  treeDepth(line: string): number {
    const match = line.match(/^\s*/);
    const spaces = match ? match[0].length : 0;
    return Math.max(0, Math.floor(spaces / 2));
  }

  treeLabel(line: string): string {
    return line.trim();
  }

  issueBadgeClass(difficulty: string): string {
    const value = difficulty.toLowerCase();
    if (value === 'easy') return 'issue-badge easy';
    if (value === 'hard') return 'issue-badge hard';
    return 'issue-badge medium';
  }
}
