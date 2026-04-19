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

type TreeNode = {
  name: string;
  kind: 'dir' | 'file';
  children: Record<string, TreeNode>;
};

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
  treeDisplayLines: string[] = [];

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
      this.treeDisplayLines = this.buildTreeDisplay(this.deep.tree_lines || []);
      if (!this.treeDisplayLines.length) {
        this.treeDisplayLines = (this.deep.tree_lines || []).map((line) => line.trim()).filter(Boolean);
      }
    } catch (error) {
      console.error(error);
      this.deepError = 'Could not load deep project analysis right now.';
      this.treeDisplayLines = [];
    } finally {
      this.isLoadingDeep = false;
    }
  }

  private buildTreeDisplay(rawLines: string[]): string[] {
    if (!rawLines.length) {
      return [];
    }

    const root: TreeNode = { name: '', kind: 'dir', children: {} };

    for (const rawLine of rawLines) {
      const parsed = this.parseTreeLine(rawLine);
      if (!parsed) {
        continue;
      }

      const parts = parsed.path.split('/').map((part) => part.trim()).filter(Boolean);
      if (!parts.length) {
        continue;
      }

      let cursor = root;
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index];
        const isLeaf = index === parts.length - 1;
        const kind: 'dir' | 'file' = isLeaf ? (parsed.isDir ? 'dir' : 'file') : 'dir';

        if (!cursor.children[part]) {
          cursor.children[part] = {
            name: part,
            kind,
            children: {},
          };
        } else if (kind === 'dir') {
          cursor.children[part].kind = 'dir';
        }

        cursor = cursor.children[part];
      }
    }

    const lines: string[] = [];
    this.renderTreeNodes(Object.values(root.children), '', lines);
    return lines;
  }

  private parseTreeLine(rawLine: string): { path: string; isDir: boolean } | null {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      return null;
    }

    const match = trimmed.match(/^\[(D|F)\]\s+(.+)$/);
    if (match) {
      return {
        isDir: match[1] === 'D',
        path: match[2].trim(),
      };
    }

    return {
      isDir: false,
      path: trimmed,
    };
  }

  private renderTreeNodes(nodes: TreeNode[], prefix: string, output: string[]): void {
    const sorted = [...nodes].sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === 'dir' ? -1 : 1;
      }
      return left.name.localeCompare(right.name);
    });

    sorted.forEach((node, index) => {
      const isLast = index === sorted.length - 1;
      const branch = isLast ? '\\-- ' : '|-- ';
      const marker = node.kind === 'dir' ? '[D]' : '[F]';

      output.push(`${prefix}${branch}${marker} ${node.name}`);

      const children = Object.values(node.children);
      if (children.length) {
        const nextPrefix = `${prefix}${isLast ? '    ' : '|   '}`;
        this.renderTreeNodes(children, nextPrefix, output);
      }
    });
  }

  issueBadgeClass(difficulty: string): string {
    const value = difficulty.toLowerCase();
    if (value === 'easy') return 'issue-badge easy';
    if (value === 'hard') return 'issue-badge hard';
    return 'issue-badge medium';
  }
}
