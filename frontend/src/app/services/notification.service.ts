import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';
import { environment } from '../../environments/environment';
import { firstValueFrom, BehaviorSubject } from 'rxjs';

export interface Notification {
  id: string;
  message: string;
  read_status: boolean;
  created_at: string;
}

export interface NotificationsResponse {
  notifications: Notification[];
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private http = inject(HttpClient);
  private authService = inject(AuthService);

  // Observable state for the bell icon
  public notifications = new BehaviorSubject<Notification[]>([]);
  public unreadCount = new BehaviorSubject<number>(0);

  private async buildAuthHeaders(): Promise<HttpHeaders> {
    const token = await this.authService.getIdToken();
    if (!token) {
      throw new Error('Authentication required');
    }
    return new HttpHeaders({ Authorization: `Bearer ${token}` });
  }

  async fetchNotifications(): Promise<void> {
    try {
      const headers = await this.buildAuthHeaders();
      const res = await firstValueFrom(
        this.http.get<NotificationsResponse>(`${environment.apiUrl}/users/me/notifications`, { headers })
      );
      this.notifications.next(res.notifications);
      this.updateUnreadCount(res.notifications);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
    }
  }

  async markAsRead(notifId: string): Promise<void> {
    try {
      const headers = await this.buildAuthHeaders();
      await firstValueFrom(
        this.http.patch<Notification>(`${environment.apiUrl}/users/me/notifications/${notifId}/read`, {}, { headers })
      );
      
      // Update local state optimistic UI
      const current = this.notifications.value;
      const updated = current.map(n => n.id === notifId ? { ...n, read_status: true } : n);
      this.notifications.next(updated);
      this.updateUnreadCount(updated);
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
    }
  }

  private updateUnreadCount(notifs: Notification[]) {
    this.unreadCount.next(notifs.filter(n => !n.read_status).length);
  }

  // Poll for new notifications
  startPolling(intervalMs: number = 60000): any {
    this.fetchNotifications();
    return setInterval(() => this.fetchNotifications(), intervalMs);
  }
}
