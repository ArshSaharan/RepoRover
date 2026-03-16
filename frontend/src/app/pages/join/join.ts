import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Wrench, Github, Mail, KeyRound, Zap, ArrowLeft, Eye, EyeOff } from 'lucide-angular';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-join',
  standalone: true,
  imports: [RouterLink, LucideAngularModule, CommonModule, FormsModule],
  templateUrl: './join.html',
  styleUrl: './join.css',
})
export class Join {
  readonly Wrench = Wrench;
  readonly Github = Github;
  readonly Mail = Mail;
  readonly KeyRound = KeyRound;
  readonly Zap = Zap;
  readonly ArrowLeft = ArrowLeft;
  readonly Eye = Eye;
  readonly EyeOff = EyeOff;

  isEmailSignup = false;
  showPassword = false;
  isLoading = false;
  errorMessage = '';

  email = '';
  password = '';
  confirmPassword = '';

  constructor(private authService: AuthService) {}

  toggleEmailSignup() {
    this.isEmailSignup = !this.isEmailSignup;
    this.errorMessage = '';
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }

  signupWithGitHub() {
    this.authService.loginWithGitHub();
  }

  async onSubmit() {
    if (this.password !== this.confirmPassword) {
      this.errorMessage = 'Passwords do not match';
      return;
    }

    if (this.password.length < 6) {
      this.errorMessage = 'Password must be at least 6 characters';
      return;
    }

    this.isLoading = true;
    this.errorMessage = '';

    try {
      await this.authService.signupWithEmail(this.email, this.password);
    } catch (error: any) {
      this.errorMessage = error.message || 'Signup failed. Please try again.';
    } finally {
      this.isLoading = false;
    }
  }
}
