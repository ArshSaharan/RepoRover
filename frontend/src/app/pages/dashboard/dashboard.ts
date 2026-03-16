import { Component } from '@angular/core';
import {
  LucideAngularModule, Search, Bell, TrendingUp, Zap, Star,
  Bookmark, ArrowUpRight, Activity, ExternalLink, GitMerge,
  AlertCircle, BarChart2
} from 'lucide-angular';
import { CommonModule } from '@angular/common';
import { Sidebar } from '../../components/sidebar/sidebar';
import { Onboarding } from '../../components/onboarding/onboarding';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-dashboard',
  imports: [LucideAngularModule, CommonModule, Sidebar, Onboarding],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class Dashboard {
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

  constructor(public authService: AuthService) {
    this.showOnboarding = this.authService.isNewUser;
  }

  stats = [
    { label: 'TOTAL CONTRIBUTIONS', value: '1,284', delta: '+12%', deltaLabel: 'from last month', icon: Zap, positive: true },
    { label: 'MATCH ACCURACY', value: '94.2%', delta: '+42.4%', deltaLabel: 'AI model improvement', icon: BarChart2, positive: true },
    { label: 'OPEN ISSUES', value: '12', delta: null, deltaLabel: 'Across 3 active repositories', icon: AlertCircle, positive: null },
  ];

  recommendations = [
    { name: 'react-hook-form', lang: 'ts', version: 'v7.45.0', match: 98, desc: 'Performant, flexible and extensible form...', saved: false },
    { name: 'tensorflow', lang: 'py', version: 'v2.13.0', match: 92, desc: 'An Open Source Machine Learning...', saved: false },
    { name: 'tauri', lang: 'rs', version: 'v1.4.0', match: 89, desc: 'Build smaller, faster, and more secure...', saved: false },
    { name: 'astro', lang: 'ts', version: 'v2.10.1', match: 85, desc: 'The all-in-one web framework designed...', saved: false },
  ];

  urgentIssues = [
    { title: 'Memory leak in useForm hook', repo: 'react-hook-form', tags: ['bug', 'perf'], difficulty: 'Hard' },
    { title: 'Add window dragging example', repo: 'tauri', tags: ['docs', 'gfi'], difficulty: 'Easy' },
  ];

  liveActivity = [
    { time: '12h ago', html: '<strong>dev_alex</strong> merged PR <span class="text-orange">#402</span> in <strong>facebook/react</strong>', sub: '+142 -34 Lines changed' },
    { time: '46m ago', html: 'New issue <span class="text-orange">bug: memory_leak</span> detected in <strong>vercel/next.js</strong> matching your skills.', sub: '<span class="text-orange c-pointer">View Details</span>' },
    { time: '2h ago', html: '<strong>sarah_codes</strong> starred your tracked repo <strong>trpc/trpc</strong>', sub: '' },
  ];

  toggleSave(i: number) {
    this.recommendations[i].saved = !this.recommendations[i].saved;
  }

  matchColor(match: number): string {
    if (match >= 95) return '#22c55e';
    if (match >= 85) return '#f97316';
    return '#eab308';
  }
}
