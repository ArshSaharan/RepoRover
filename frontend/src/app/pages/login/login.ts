import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Wrench, Github, Mail, KeyRound, Zap, ArrowLeft, Eye, EyeOff } from 'lucide-angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [RouterLink, LucideAngularModule, CommonModule, FormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  readonly Wrench = Wrench;
  readonly Github = Github;
  readonly Mail = Mail;
  readonly KeyRound = KeyRound;
  readonly Zap = Zap;
  readonly ArrowLeft = ArrowLeft;
  readonly Eye = Eye;
  readonly EyeOff = EyeOff;

  isEmailLogin = false;
  showPassword = false;
  isLoading = false;
  errorMessage = '';

  email = '';
  password = '';

  constructor(private authService: AuthService) {}

  toggleEmailLogin() {
    this.isEmailLogin = !this.isEmailLogin;
    this.errorMessage = '';
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  loginWithGitHub() {
    this.authService.loginWithGitHub();
  }

  async onSubmit() {
    if (!this.email || !this.password) return;

    this.isLoading = true;
    this.errorMessage = '';

    try {
      await this.authService.loginWithEmail(this.email, this.password);
    } catch (error: any) {
      this.errorMessage = error.message || 'Login failed. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }
}
