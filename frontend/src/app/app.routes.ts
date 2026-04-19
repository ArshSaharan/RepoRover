import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./pages/landing/landing').then(m => m.Landing),
  },
  {
    path: 'login',
    loadComponent: () => import('./pages/login/login').then(m => m.Login),
  },
  {
    path: 'join',
    loadComponent: () => import('./pages/join/join').then(m => m.Join),
  },
  {
    path: 'callback',
    loadComponent: () => import('./pages/callback/callback').then(m => m.Callback),
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard),
    canActivate: [authGuard],
  },
  {
    path: 'explore',
    loadComponent: () => import('./pages/explore/explore').then(m => m.Explore),
    canActivate: [authGuard],
  },
  {
    path: 'contributions',
    loadComponent: () => import('./pages/contributions/contributions').then(m => m.Contributions),
    canActivate: [authGuard],
  },
  {
    path: 'saved',
    loadComponent: () => import('./pages/saved/saved').then(m => m.Saved),
    canActivate: [authGuard],
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile').then(m => m.Profile),
    canActivate: [authGuard],
  },
  {
    path: 'settings',
    loadComponent: () => import('./pages/settings/settings').then(m => m.Settings),
    canActivate: [authGuard],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
