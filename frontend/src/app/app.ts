import { Component, OnInit, OnDestroy, PLATFORM_ID, Inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import Lenis from 'lenis';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  template: `<router-outlet></router-outlet>`,
  styleUrl: './app.css'
})
export class App implements OnInit, OnDestroy {
  private lenis?: Lenis;
  private rafId?: number;

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  ngOnInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    // Apply saved theme at app launch
    const savedTheme = localStorage.getItem('rr-theme');
    if (savedTheme && savedTheme !== 'theme-normal') {
      document.body.classList.add(savedTheme);
    }

    this.lenis = new Lenis({
      duration: 1.2,
      easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });

    const raf = (time: number) => {
      this.lenis!.raf(time);
      this.rafId = requestAnimationFrame(raf);
    };
    this.rafId = requestAnimationFrame(raf);

    // Scroll-reveal — add .rr-reveal to any element to animate on scroll-in
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('rr-revealed');
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    // Observe after a short delay so the DOM is ready
    setTimeout(() => {
      document.querySelectorAll('.rr-reveal').forEach((el) => observer.observe(el));

      // Re-observe on route changes via MutationObserver
      const mutObs = new MutationObserver(() => {
        document.querySelectorAll('.rr-reveal:not(.rr-revealed)').forEach((el) => observer.observe(el));
      });
      mutObs.observe(document.body, { childList: true, subtree: true });
    }, 100);
  }

  ngOnDestroy(): void {
    this.lenis?.destroy();
    if (this.rafId) cancelAnimationFrame(this.rafId);
  }
}
