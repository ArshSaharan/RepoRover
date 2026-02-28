import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Wrench, Github, Mail, KeyRound, Zap } from 'lucide-angular';

@Component({
  selector: 'app-login',
  imports: [RouterLink, LucideAngularModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  readonly Wrench = Wrench;
  readonly Github = Github;
  readonly Mail = Mail;
  readonly KeyRound = KeyRound;
  readonly Zap = Zap;
}
