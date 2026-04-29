import { Component, computed, OnInit, OnDestroy } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideAngularModule, LayoutDashboard, Compass, GitPullRequest,
  Bookmark, Settings, Zap, ChevronRight, LogOut, User, Bell
} from 'lucide-angular';
import { AuthService } from '../../services/auth.service';
import { NotificationService } from '../../services/notification.service';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar implements OnInit, OnDestroy {
  readonly LayoutDashboard = LayoutDashboard;
  readonly Compass = Compass;
  readonly GitPullRequest = GitPullRequest;
  readonly Bookmark = Bookmark;
  readonly Settings = Settings;
  readonly Zap = Zap;
  readonly ChevronRight = ChevronRight;
  readonly LogOut = LogOut;
  readonly User = User;
  readonly Bell = Bell;

  unreadCount = 0;
  private notifSub: any;
  private pollingInterval: any;

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

  constructor(
    private authService: AuthService,
    private notificationService: NotificationService
  ) { }

  ngOnInit(): void {
    // Only fetch if user is logged in
    if (this.authService.user()) {
      this.notifSub = this.notificationService.unreadCount.subscribe(count => {
        this.unreadCount = count;
      });
      // Start polling for notifications every minute
      this.pollingInterval = this.notificationService.startPolling(60000);
    }
  }

  ngOnDestroy(): void {
    if (this.notifSub) this.notifSub.unsubscribe();
    if (this.pollingInterval) clearInterval(this.pollingInterval);
  }

  logout(): void {
    this.authService.logout();
  }
}
