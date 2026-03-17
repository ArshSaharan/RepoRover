import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { LucideAngularModule, User, Github, FileText, Check, AlertCircle, Search, Bell, MapPin, Clock, Eye, Edit2, Key, Loader2, Palette, X } from 'lucide-angular';
import { AuthService, GitHubStats } from '../../services/auth.service';
import { Sidebar } from '../../components/sidebar/sidebar';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, FormsModule, LucideAngularModule, Sidebar],
  templateUrl: './settings.html',
  styleUrl: './settings.css'
})
export class Settings implements OnInit {
  // Icons
  readonly UserIcon = User;
  readonly GithubIcon = Github;
  readonly FileTextIcon = FileText;
  readonly CheckIcon = Check;
  readonly AlertIcon = AlertCircle;
  readonly Search = Search;
  readonly Bell = Bell;
  readonly MapPin = MapPin;
  readonly Clock = Clock;
  readonly Eye = Eye;
  readonly Edit2 = Edit2;
  readonly Loader2 = Loader2;
  readonly Palette = Palette;
  readonly X = X;

  // Global Page Loading
  isPageLoading = signal<boolean>(true);

  // GitHub Stats
  githubStats = signal<GitHubStats | null>(null);
  
  // Computed info
  githubLocation = computed(() => this.githubStats()?.location || 'Unknown');
  displayName = computed(() => this.githubStats()?.name || this.authService.userProfile()?.display_name || '');
  githubUsername = computed(() => this.githubStats()?.username || this.authService.userProfile()?.github_username || '');
  
  // Current time logic for UI (matches image "22:25 (UTC +05:30)")
  currentTime = signal<string>('');

  // LLM Profile State
  llmProfile = '';
  isPreviewMode = signal<boolean>(false);
  isLlmSaving = signal<boolean>(false);
  llmSaveSuccess = signal<boolean>(false);

  // Theme State
  showThemePopup = signal<boolean>(false);
  themes = [
    { id: 'theme-normal', name: 'Original Orange (Default)', color: '#f97316' },
    { id: 'theme-cyber', name: 'Cyber-Yellow & True Black', color: '#eab308' },
    { id: 'theme-matrix', name: 'Matrix Terminal', color: '#4ade80' },
    { id: 'theme-synthwave', name: 'Synthwave / Cyberpunk', color: '#ec4899' },
    { id: 'theme-arctic', name: 'Arctic / Electric Tech', color: '#3b82f6' },
    { id: 'theme-mono', name: 'Pure Monochrome', color: '#ffffff' }
  ];
  currentTheme = signal<string>('theme-normal');

  constructor(private authService: AuthService, private sanitizer: DomSanitizer) { }

  ngOnInit() {
    this.initTheme();
    this.initialLoad();
    this.updateTime();
    setInterval(() => this.updateTime(), 60000);
  }

  initTheme() {
    const savedTheme = localStorage.getItem('rr-theme') || 'theme-normal';
    this.currentTheme.set(savedTheme);
  }

  toggleThemePopup() {
    this.showThemePopup.set(!this.showThemePopup());
  }

  setTheme(themeId: string, reload: boolean = true) {
    this.currentTheme.set(themeId);
    localStorage.setItem('rr-theme', themeId);
    
    // Remove all theme classes first
    this.themes.forEach(t => document.body.classList.remove(t.id));
    // Add the new theme class
    if (themeId !== 'theme-normal') {
      document.body.classList.add(themeId);
    }
    
    if (reload) {
      this.showThemePopup.set(false);
      setTimeout(() => {
        window.location.reload();
      }, 150);
    }
  }
  
  async initialLoad() {
    this.isPageLoading.set(true);
    await Promise.all([
      this.loadGitHubStats(),
      this.loadLlmProfile()
    ]);
    // Small delay to ensure smooth transition
    setTimeout(() => this.isPageLoading.set(false), 400);
  }
  
  updateTime() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const offset = -now.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const offsetHours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0');
    const offsetMinutes = (Math.abs(offset) % 60).toString().padStart(2, '0');
    this.currentTime.set(`${hours}:${minutes} (UTC ${sign}${offsetHours}:${offsetMinutes})`);
  }

  async loadGitHubStats() {
    try {
      const stats = await this.authService.getGitHubProfile();
      this.githubStats.set(stats);
    } catch (e) {
      console.error(e);
    }
  }

  async loadLlmProfile() {
    const profileText = await this.authService.getLLMProfile();
    this.llmProfile = profileText || '';
  }
  
  togglePreview() {
    this.isPreviewMode.set(!this.isPreviewMode());
  }

  get parsedMarkdown(): string {
    if (!this.llmProfile) return '';
    
    // Very basic markdown parser
    let html = this.llmProfile
      // Escaping HTML tags to prevent XSS
      .replace(/</g, '&lt;').replace(/>/g, '&gt;')
      // Headers
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      // Bold
      .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/gim, '<em>$1</em>')
      // Links
      .replace(/\[(.*?)\]\((.*?)\)/gim, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
      // Lists
      .replace(/^\s*-\s(.*$)/gim, '<ul><li>$1</li></ul>')
      // Newlines
      .replace(/\n$/gim, '<br />')
      .replace(/\n/gim, '<br />');
    
    // Fix nested lists creating multiple <ul> tags incorrectly (simple fix)
    html = html.replace(/<\/ul><br \/><ul>/g, '');
    html = html.replace(/<\/ul><ul>/g, '');

    return html;
  }

  async saveLlmProfile() {
    if (!this.llmProfile.trim()) return;

    this.isLlmSaving.set(true);
    try {
      const success = await this.authService.updateLLMProfile(this.llmProfile);
      if (success) {
        this.llmSaveSuccess.set(true);
        setTimeout(() => this.llmSaveSuccess.set(false), 3000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.isLlmSaving.set(false);
    }
  }
}
