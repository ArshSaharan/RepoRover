import { Component } from '@angular/core';
import { LucideAngularModule, Search, Bell, TrendingUp, Star, Zap, Filter, ChevronRight } from 'lucide-angular';
import { Sidebar } from '../../components/sidebar/sidebar';

@Component({
  selector: 'app-explore',
  imports: [LucideAngularModule, Sidebar],
  templateUrl: './explore.html',
  styleUrl: './explore.css',
})
export class Explore {
  readonly Search = Search;
  readonly Bell = Bell;
  readonly TrendingUp = TrendingUp;
  readonly Star = Star;
  readonly Zap = Zap;
  readonly Filter = Filter;
  readonly ChevronRight = ChevronRight;

  sortMode: 'relevance' | 'difficulty' = 'relevance';

  forgeCategories = [
    { name: 'Machine Learning', emoji: '🤖', meta: '123 ACTIVE REPOS' },
    { name: 'Rust Systems', emoji: '⚙️', meta: '45 CRITICAL ISSUES' },
    { name: 'Frontend Tools', emoji: '🎨', meta: '842 OPEN REQUESTS' },
    { name: 'Frameworks', emoji: '🚀', meta: 'NEW & TRENDING' },
  ];

  repos = [
    {
      name: 'react-hook-form',
      langs: ['typescript', 'forms'],
      match: 98,
      desc: 'Performant, flexible and extensible forms with easy-to-use validation.',
      tags: ['good-first-issue', 'help-wanted'],
      stars: '34.2k',
    },
    {
      name: 'tensorflow',
      langs: ['python', 'ml'],
      match: 89,
      desc: 'An Open Source Machine Learning Framework for everyone.',
      tags: ['bug', 'core'],
      stars: '174k',
    },
    {
      name: 'tauri',
      langs: ['rust', 'desktop'],
      match: 78,
      desc: 'Build smaller, faster, and more secure desktop applications.',
      tags: ['feature'],
      stars: '69.5k',
    },
    {
      name: 'astro',
      langs: ['typescript', 'ssg'],
      match: 82,
      desc: 'The all-in-one web framework designed for speed.',
      tags: ['good-first-issue'],
      stars: '33.9k',
    },
  ];

  trending = [
    { name: 'shadcn/ui', delta: '+123%', meta: '3.2k stars/week', rank: '#1 Web', trend: 'up' },
    { name: 'bun-js', delta: '+8%', meta: '1.8k stars/week', rank: '#2 Runtime', trend: 'up' },
    { name: 'rust-lang', delta: '+6%', meta: 'Stable activity', rank: '#3 Sys', trend: 'stable' },
  ];

  getLangClass(lang: string): string {
    const map: Record<string, string> = { typescript: 'ts', python: 'py', rust: 'rs', ml: 'ml' };
    return map[lang] || '';
  }

  getTagClass(tag: string): string {
    if (tag.includes('first')) return 'gfi';
    if (tag === 'bug') return 'bug';
    if (tag === 'feature') return 'feat';
    if (tag === 'core') return 'ts';
    return 'docs';
  }

  matchColor(match: number): string {
    if (match >= 95) return '#22c55e';
    if (match >= 85) return '#f97316';
    return '#eab308';
  }
}
