import { Component, AfterViewInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, ArrowRight, Zap, Bell, BarChart2, Github, Twitter, Mail, Code2, Star, GitFork, ChevronRight } from 'lucide-angular';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

@Component({
  selector: 'app-landing',
  imports: [RouterLink, LucideAngularModule],
  providers: [
    { provide: 'LucideIcons', useValue: { ArrowRight, Zap, Bell, BarChart2, Github, Twitter, Mail, Code2, Star, GitFork, ChevronRight } }
  ],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing implements AfterViewInit, OnDestroy {
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

  private isBrowser = false;

  stats = [
    { value: '12k+', label: 'DEVELOPERS', numericValue: 12000 },
    { value: '850+', label: 'REPOSITORIES', numericValue: 850 },
    { value: '98%', label: 'MATCH RATE', numericValue: 98 },
    { value: '24/7', label: 'SCOUTING', numericValue: 24 },
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

  constructor(@Inject(PLATFORM_ID) private platformId: object) {
    this.isBrowser = isPlatformBrowser(this.platformId);
  }

  ngAfterViewInit(): void {
    if (!this.isBrowser) return;

    gsap.registerPlugin(ScrollTrigger);

    // ─── Hero Animations ──────────────────────────────────────
    const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });

    heroTl
      .from('.hero-badge', {
        y: 30, opacity: 0, duration: 0.7, delay: 0.2,
      })
      .from('.hero-title', {
        y: 50, opacity: 0, duration: 0.9,
      }, '-=0.4')
      .from('.hero-subtitle', {
        y: 30, opacity: 0, duration: 0.7,
      }, '-=0.5')
      .from('.hero-cta', {
        y: 20, opacity: 0, duration: 0.6,
      }, '-=0.3')
      .from('.hero-grid-bg', {
        opacity: 0, duration: 1.2,
      }, '-=0.8');

    // ─── Navbar entrance ──────────────────────────────────────
    gsap.from('.rr-nav', {
      y: -60, opacity: 0, duration: 0.8, ease: 'power2.out', delay: 0.1,
    });

    // ─── Stats counter animation ──────────────────────────────
    gsap.utils.toArray<HTMLElement>('.stat-value').forEach((el, i) => {
      const stat = this.stats[i];
      if (!stat) return;

      ScrollTrigger.create({
        trigger: el,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          const suffix = stat.value.replace(/[\d,]/g, '');  // e.g. "k+", "+", "%", "/7"
          const obj = { val: 0 };
          gsap.to(obj, {
            val: stat.numericValue,
            duration: 1.6,
            ease: 'power2.out',
            onUpdate: () => {
              if (suffix === 'k+') {
                el.textContent = Math.floor(obj.val / 1000) + 'k+';
              } else if (suffix === '%') {
                el.textContent = Math.floor(obj.val) + '%';
              } else if (suffix === '/7') {
                el.textContent = Math.floor(obj.val) + '/7';
              } else {
                el.textContent = Math.floor(obj.val).toLocaleString() + suffix;
              }
            },
          });
        },
      });
    });

    // ─── Feature cards stagger ────────────────────────────────
    gsap.from('.feature-card', {
      scrollTrigger: {
        trigger: '.features-section',
        start: 'top 75%',
        once: true,
      },
      y: 60,
      opacity: 0,
      duration: 0.8,
      stagger: 0.15,
      ease: 'power3.out',
    });

    // ─── Code block typing effect ─────────────────────────────
    gsap.from('.code-block', {
      scrollTrigger: {
        trigger: '.integration-section',
        start: 'top 75%',
        once: true,
      },
      x: -80,
      opacity: 0,
      duration: 1,
      ease: 'power3.out',
    });

    // ─── Steps cascade ────────────────────────────────────────
    gsap.from('.step-item', {
      scrollTrigger: {
        trigger: '.steps-list',
        start: 'top 80%',
        once: true,
      },
      x: 50,
      opacity: 0,
      duration: 0.7,
      stagger: 0.12,
      ease: 'power3.out',
    });

    // ─── Integration title ────────────────────────────────────
    gsap.from('.integration-title', {
      scrollTrigger: {
        trigger: '.integration-title',
        start: 'top 80%',
        once: true,
      },
      x: 50,
      opacity: 0,
      duration: 0.9,
      ease: 'power3.out',
    });

    // ─── Footer columns stagger ───────────────────────────────
    gsap.from('.rr-footer .col-12, .rr-footer .col-6, .rr-footer .col-md-2, .rr-footer .col-md-4', {
      scrollTrigger: {
        trigger: '.rr-footer',
        start: 'top 85%',
        once: true,
      },
      y: 40,
      opacity: 0,
      duration: 0.7,
      stagger: 0.1,
      ease: 'power3.out',
    });
  }

  ngOnDestroy(): void {
    if (this.isBrowser) {
      ScrollTrigger.getAll().forEach(t => t.kill());
    }
  }

  scrollTo(event: Event, id: string): void {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }
}
