import { Injectable, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import {
  Auth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithCustomToken,
  signOut,
  onAuthStateChanged,
  User,
} from '@angular/fire/auth';
import { environment } from '../../environments/environment';

export interface UserProfile {
  uid: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
  github_username: string | null;
  bio?: string | null;
  provider: string;
  is_new_user: boolean;
}

export interface GitHubStats {
  username: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  public_repos: number;
  followers: number;
  following: number;
  total_prs: number;
  total_issues: number;
  repos: any[];
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private currentUser = signal<User | null>(null);
  private _isNewUser = signal<boolean>(false);
  private _userProfile = signal<UserProfile | null>(null);

  readonly user = this.currentUser.asReadonly();
  readonly isLoggedIn = computed(() => !!this.currentUser());
  readonly isNewUser = this._isNewUser.asReadonly();
  readonly userProfile = this._userProfile.asReadonly();

  constructor(
    private auth: Auth,
    private router: Router,
  ) {
    onAuthStateChanged(this.auth, (user) => {
      this.currentUser.set(user);
    });
  }

  private async waitForUser(timeoutMs = 5000): Promise<User | null> {
    const existing = this.currentUser();
    if (existing) {
      return existing;
    }

    return new Promise((resolve) => {
      let resolved = false;
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve(this.auth.currentUser);
        }
      }, timeoutMs);

      const unsubscribe = onAuthStateChanged(this.auth, (user) => {
        if (resolved) {
          return;
        }
        clearTimeout(timeout);
        resolved = true;
        unsubscribe();
        resolve(user);
      });
    });
  }

  // ─── Email / Password ───────────────────────────────────────
  async loginWithEmail(email: string, password: string): Promise<void> {
    try {
      const cred = await signInWithEmailAndPassword(this.auth, email, password);
      const idToken = await cred.user.getIdToken();

      // Verify with backend and get profile
      const resp = await fetch(`${environment.apiUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_token: idToken }),
      });

      if (resp.ok) {
        const profile = await resp.json();
        this._userProfile.set(profile);
        this._isNewUser.set(profile.is_new_user || false);
      }

      this.router.navigate(['/dashboard']);
    } catch (error: any) {
      throw new Error(error.message || 'Login failed');
    }
  }

  async signupWithEmail(email: string, password: string): Promise<void> {
    try {
      // Create user in Firebase Auth (client-side)
      const cred = await createUserWithEmailAndPassword(this.auth, email, password);
      const idToken = await cred.user.getIdToken();

      // Register on backend (stores in Firestore, does NOT re-create Firebase Auth user)
      const resp = await fetch(`${environment.apiUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id_token: idToken,
          display_name: email.split('@')[0],
        }),
      });

      if (resp.ok) {
        const data = await resp.json();
        this._isNewUser.set(data.is_new_user || true);
        this._userProfile.set({
          uid: data.uid,
          email: data.email,
          display_name: data.display_name,
          avatar_url: null,
          github_username: null,
          provider: 'email',
          is_new_user: data.is_new_user,
        });
      }

      this.router.navigate(['/dashboard']);
    } catch (error: any) {
      throw new Error(error.message || 'Signup failed');
    }
  }

  // ─── GitHub OAuth ───────────────────────────────────────────
  loginWithGitHub(): void {
    window.location.href = `${environment.apiUrl}/auth/github`;
  }

  linkGitHub(): void {
    window.location.href = `${environment.apiUrl}/auth/github/link`;
  }

  async handleGitHubCallback(customToken: string, isNew: boolean): Promise<void> {
    try {
      await signInWithCustomToken(this.auth, customToken);
      this._isNewUser.set(isNew);
      this.router.navigate(['/dashboard']);
    } catch (error: any) {
      console.error('GitHub callback error:', error);
      this.router.navigate(['/login']);
    }
  }

  // ─── GitHub Profile Data ────────────────────────────────────
  async fetchGitHubProfile(): Promise<GitHubStats | null> {
    const user = await this.waitForUser();
    if (!user) return null;

    const idToken = await user.getIdToken();
    const resp = await fetch(`${environment.apiUrl}/auth/github/profile`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!resp.ok) return null;
    return resp.json();
  }

  // ─── Complete onboarding ────────────────────────────────────
  async completeOnboarding(
    displayName: string,
    skills: string[] = [],
    interests: string[] = [],
    githubUsername?: string
  ): Promise<void> {
    const user = this.currentUser();
    if (!user) return;

    const idToken = await user.getIdToken();
    const body: any = { 
      display_name: displayName,
      skills,
      interests
    };
    if (githubUsername) body.github_username = githubUsername;

    await fetch(`${environment.apiUrl}/users/me`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });

    this._isNewUser.set(false);
  }

  // ─── LLM Profile Management ─────────────────────────────────
  async getLLMProfile(): Promise<string | null> {
    const user = await this.waitForUser();
    if (!user) return null;

    const idToken = await user.getIdToken();
    const resp = await fetch(`${environment.apiUrl}/users/me/llm-profile`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    return data.content;
  }

  async updateLLMProfile(content: string): Promise<boolean> {
    const user = await this.waitForUser();
    if (!user) return false;

    const idToken = await user.getIdToken();
    const resp = await fetch(`${environment.apiUrl}/users/me/llm-profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify({ content }),
    });

    return resp.ok;
  }

  // ─── Logout ─────────────────────────────────────────────────
  async logout(): Promise<void> {
    await signOut(this.auth);
    this._isNewUser.set(false);
    this._userProfile.set(null);
    this.router.navigate(['/login']);
  }

  // ─── GitHub Stats ───────────────────────────────────────────
  async getGitHubProfile(): Promise<GitHubStats | null> {
    const user = await this.waitForUser();
    if (!user) return null;

    const idToken = await user.getIdToken();
    const resp = await fetch(`${environment.apiUrl}/auth/github/profile`, {
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!resp.ok) return null;
    return await resp.json();
  }

  // ─── Token helpers ──────────────────────────────────────────
  async getIdToken(): Promise<string | null> {
    const user = await this.waitForUser();
    if (!user) return null;
    return user.getIdToken();
  }
}
