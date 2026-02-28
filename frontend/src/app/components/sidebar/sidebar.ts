import { Component, Input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import {
  LucideAngularModule, LayoutDashboard, Compass, GitPullRequest,
  Bookmark, Settings, Zap, ChevronRight, LogOut, User
} from 'lucide-angular';

@Component({
  selector: 'app-sidebar',
  imports: [RouterLink, RouterLinkActive, LucideAngularModule],
  templateUrl: './sidebar.html',
  styleUrl: './sidebar.css',
})
export class Sidebar {
  @Input() contributionCount = 4;

  readonly LayoutDashboard = LayoutDashboard;
  readonly Compass = Compass;
  readonly GitPullRequest = GitPullRequest;
  readonly Bookmark = Bookmark;
  readonly Settings = Settings;
  readonly Zap = Zap;
  readonly ChevronRight = ChevronRight;
  readonly LogOut = LogOut;
  readonly User = User;

  navItems = [
    { label: 'Dashboard', icon: LayoutDashboard, route: '/dashboard' },
    { label: 'Explore', icon: Compass, route: '/explore' },
    { label: 'My Contributions', icon: GitPullRequest, route: '/contributions', badge: 4 },
    { label: 'Saved Repos', icon: Bookmark, route: '/saved' },
  ];

  systemItems = [
    { label: 'Settings', icon: Settings, route: '/settings' },
  ];
}
