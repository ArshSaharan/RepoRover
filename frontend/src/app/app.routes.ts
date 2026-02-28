import { Routes } from '@angular/router';

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
    path: 'dashboard',
    loadComponent: () => import('./pages/dashboard/dashboard').then(m => m.Dashboard),
  },
  {
    path: 'explore',
    loadComponent: () => import('./pages/explore/explore').then(m => m.Explore),
  },
  {
    path: 'saved',
    loadComponent: () => import('./pages/saved/saved').then(m => m.Saved),
  },
  {
    path: 'profile',
    loadComponent: () => import('./pages/profile/profile').then(m => m.Profile),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
