import { Component, computed } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideAngularModule, LayoutDashboard, Compass, GitPullRequest,
  Bookmark, Settings, Zap, ChevronRight, LogOut, User
} from 'lucide-angular';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  readonly LayoutDashboard = LayoutDashboard;
  readonly Compass = Compass;
  readonly GitPullRequest = GitPullRequest;
  readonly Bookmark = Bookmark;
  readonly Settings = Settings;
  readonly Zap = Zap;
  readonly ChevronRight = ChevronRight;
  readonly LogOut = LogOut;
  readonly User = User;

  readonly userName = computed(() => {
    const profile = this.authService.userProfile();
    const user = this.authService.user();
    return profile?.display_name || user?.displayName || user?.email?.split('@')[0] || 'Developer';
  });

  readonly userHandle = computed(() => {
    const profile = this.authService.userProfile();
    const user = this.authService.user();
    if (profile?.github_username) {
      return `@${profile.github_username}`;
    }
    return user?.email ? `@${user.email.split('@')[0]}` : '@dev';
  });

  readonly userAvatar = computed(() => {
    return this.authService.userProfile()?.avatar_url || this.authService.user()?.photoURL || null;
  });

  navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, route: '/dashboard' },
    { label: 'Explore', icon: Compass, route: '/explore' },
    { label: 'My Contributions', icon: GitPullRequest, route: '/contributions', badge: 4 },
    { label: 'Saved Repos', icon: Bookmark, route: '/saved' },
    { label: 'Settings', icon: Settings, route: '/settings' },
  ];

  systemItems = [
    { label: 'Settings', icon: Settings, route: '/settings' },
  ];

  constructor(private authService: AuthService) { }

  logout(): void {
    this.authService.logout();
  }
}
