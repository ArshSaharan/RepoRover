import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-callback',
  standalone: true,
  template: `
    <div class="callback-page">
      <div class="callback-loader">
        <div class="spinner"></div>
        <p>Authenticating...</p>
      </div>
    </div>
  `,
  styles: [`
    .callback-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--rr-bg-primary, #0a0a0a);
      color: var(--rr-text-primary, #f5f5f5);
    }
    .callback-loader {
      text-align: center;
    }
    .spinner {
      width: 40px; height: 40px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: #f97316;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    p {
      font-size: 0.9rem;
      color: #a3a3a3;
      font-family: 'JetBrains Mono', monospace;
    }
  `],
})
export class Callback implements OnInit {
  constructor(
    private route: ActivatedRoute,
    private authService: AuthService,
  ) {}

  ngOnInit(): void {
    const token = this.route.snapshot.queryParamMap.get('token');
    const isNew = this.route.snapshot.queryParamMap.get('is_new') === 'true';
    if (token) {
      this.authService.handleGitHubCallback(token, isNew);
    }
  }
}
