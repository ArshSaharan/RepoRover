import { Component, OnInit, OnDestroy, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService, Notification } from '../../services/notification.service';
import { LucideAngularModule, Bell, X, CheckCircle2 } from 'lucide-angular';

@Component({
  selector: 'app-notification-bell',
  standalone: true,
  imports: [CommonModule, LucideAngularModule],
  template: `
    <div class="notif-wrapper">
      <button class="dash-bell" (click)="toggleDropdown($event)">
        <lucide-icon [img]="Bell" size="16"></lucide-icon>
        @if (unreadCount > 0) {
          <span class="dash-bell-dot"></span>
        }
      </button>

      @if (isOpen) {
        <div class="notif-dropdown" (click)="$event.stopPropagation()">
          <div class="notif-header">
            <h4>Notifications</h4>
            @if (unreadCount > 0) {
              <span class="notif-badge">{{ unreadCount }} new</span>
            }
          </div>
          
          <div class="notif-body">
            @if (notifications.length === 0) {
              <div class="notif-empty">No notifications yet.</div>
            }
            @for (notif of notifications; track notif.id) {
              <div class="notif-item" [class.unread]="!notif.read_status">
                <div class="notif-icon">
                  <lucide-icon [img]="CheckCircle2" size="14" color="#f97316"></lucide-icon>
                </div>
                <div class="notif-content">
                  <div class="notif-message">{{ notif.message }}</div>
                  <div class="notif-time">{{ formatTime(notif.created_at) }}</div>
                </div>
                @if (!notif.read_status) {
                  <button class="notif-read-btn" (click)="markAsRead(notif.id)">
                    <lucide-icon [img]="X" size="12"></lucide-icon>
                  </button>
                }
              </div>
            }
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .notif-wrapper {
      position: relative;
    }
    .dash-bell {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: transparent;
      border: 1px solid var(--rr-border);
      border-radius: 8px;
      color: var(--rr-text-muted);
      cursor: pointer;
      transition: all 0.2s ease;
      position: relative;
    }
    .dash-bell:hover {
      border-color: var(--rr-border-hover);
      color: var(--rr-text-primary);
    }
    .dash-bell-dot {
      position: absolute;
      top: 6px;
      right: 6px;
      width: 6px;
      height: 6px;
      background: #f97316;
      border-radius: 50%;
      box-shadow: 0 0 0 2px var(--rr-bg);
    }
    
    .notif-dropdown {
      position: absolute;
      top: calc(100% + 8px);
      right: 0;
      width: 320px;
      max-height: 400px;
      background: rgba(24, 24, 27, 0.95);
      border: 1px solid var(--rr-border);
      border-radius: 12px;
      box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255,255,255,0.05) inset;
      backdrop-filter: blur(12px);
      z-index: 100;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: slideDown 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    }
    
    @keyframes slideDown {
      from { opacity: 0; transform: translateY(-8px) scale(0.98); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    
    .notif-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 14px 16px;
      border-bottom: 1px solid var(--rr-border);
      background: rgba(255,255,255,0.02);
    }
    .notif-header h4 {
      margin: 0;
      font-size: 0.9rem;
      font-weight: 600;
      color: #fff;
    }
    .notif-badge {
      font-size: 0.7rem;
      padding: 2px 8px;
      background: rgba(249, 115, 22, 0.15);
      color: #f97316;
      border-radius: 99px;
      font-family: 'JetBrains Mono', monospace;
    }
    
    .notif-body {
      overflow-y: auto;
      flex: 1;
    }
    .notif-empty {
      padding: 32px 16px;
      text-align: center;
      color: var(--rr-text-muted);
      font-size: 0.85rem;
    }
    
    .notif-item {
      display: flex;
      gap: 12px;
      padding: 16px;
      border-bottom: 1px solid var(--rr-border);
      transition: background 0.2s;
    }
    .notif-item:last-child {
      border-bottom: none;
    }
    .notif-item:hover {
      background: rgba(255,255,255,0.02);
    }
    .notif-item.unread {
      background: rgba(249, 115, 22, 0.04);
    }
    
    .notif-icon {
      flex-shrink: 0;
    }
    .notif-content {
      flex: 1;
      min-width: 0;
    }
    .notif-message {
      font-size: 0.85rem;
      color: #e5e5e5;
      line-height: 1.4;
      margin-bottom: 6px;
    }
    .notif-time {
      font-size: 0.75rem;
      color: var(--rr-text-muted);
    }
    
    .notif-read-btn {
      background: transparent;
      border: none;
      color: var(--rr-text-muted);
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      opacity: 0;
      transition: all 0.2s;
    }
    .notif-item:hover .notif-read-btn {
      opacity: 1;
    }
    .notif-read-btn:hover {
      background: rgba(255,255,255,0.1);
      color: #fff;
    }
  `]
})
export class NotificationBell implements OnInit, OnDestroy {
  readonly Bell = Bell;
  readonly X = X;
  readonly CheckCircle2 = CheckCircle2;

  isOpen = false;
  unreadCount = 0;
  notifications: Notification[] = [];
  
  private notifSub: any;
  private notifService = inject(NotificationService);

  ngOnInit() {
    this.notifSub = this.notifService.notifications.subscribe(notifs => {
      this.notifications = notifs;
    });
    this.notifService.unreadCount.subscribe(count => {
      this.unreadCount = count;
    });
    
    document.addEventListener('click', this.closeDropdown);
  }

  ngOnDestroy() {
    if (this.notifSub) this.notifSub.unsubscribe();
    document.removeEventListener('click', this.closeDropdown);
  }

  toggleDropdown(event: Event) {
    event.stopPropagation();
    this.isOpen = !this.isOpen;
  }

  closeDropdown = () => {
    this.isOpen = false;
  };

  markAsRead(id: string) {
    this.notifService.markAsRead(id);
  }

  formatTime(isoString: string): string {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  }
}
