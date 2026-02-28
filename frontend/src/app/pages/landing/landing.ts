import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, ArrowRight, Zap, Bell, BarChart2, Github, Twitter, Mail, Code2, Star, GitFork, ChevronRight } from 'lucide-angular';

@Component({
  selector: 'app-landing',
  imports: [RouterLink, LucideAngularModule],
  providers: [
    { provide: 'LucideIcons', useValue: { ArrowRight, Zap, Bell, BarChart2, Github, Twitter, Mail, Code2, Star, GitFork, ChevronRight } }
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  mobileMenuOpen = false;
  readonly ArrowRight = ArrowRight;
  readonly Zap = Zap;
  readonly Bell = Bell;
  readonly BarChart2 = BarChart2;
  readonly Github = Github;
  readonly Twitter = Twitter;
  readonly Mail = Mail;
  readonly Code2 = Code2;
  readonly Star = Star;
  readonly GitFork = GitFork;
  readonly ChevronRight = ChevronRight;

  stats = [
    { value: '12k+', label: 'DEVELOPERS' },
    { value: '850+', label: 'REPOSITORIES' },
    { value: '98%', label: 'MATCH RATE' },
    { value: '24/7', label: 'SCOUTING' },
  ];

  features = [
    {
      icon: Zap,
      iconLabel: 'ai_match',
      title: 'AI-Powered Matching',
      desc: 'Our neural engine analyzes your GitHub history to predict compatibility.',
      preview: '>>> analyzing_stack...\n[success] match_found: 98.4%',
    },
    {
      icon: Bell,
      iconLabel: 'live_feed',
      title: 'Real-time Alerts',
      desc: 'Get notified instantly when a relevant issue drops in your favorite repos.',
      preview: '● New Issue Detected\nrepo: facebook/react #2411',
    },
    {
      icon: BarChart2,
      iconLabel: 'metrics',
      title: 'Ironclad Insights',
      desc: 'Deep dive into repository health and community responsiveness metrics.',
      preview: 'Health ████████░░ A+',
    },
  ];

  steps = [
    { n: 1, title: 'Connect GitHub', desc: 'Securely link your profile. We only read public data to build your persona.' },
    { n: 2, title: 'Define Your Stack', desc: 'Filter by languages, frameworks, and issue difficulty (Good First Issue, etc.).' },
    { n: 3, title: 'Start Contributing', desc: 'Receive curated issue feeds directly to your dashboard or Slack.' },
  ];

  footerProduct = ['Features', 'Integrations', 'Pricing', 'Changelog'];
  footerResources = ['Documentation', 'API Reference', 'Community', 'Open Source Guide'];

  scrollTo(event: Event, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }
}
