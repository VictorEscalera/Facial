import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormControl, FormGroup, Validators } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  IonSpinner,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { lockClosedOutline, mailOutline, scanCircleOutline, scanOutline } from 'ionicons/icons';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    IonContent,
    IonCard,
    IonCardContent,
    IonItem,
    IonIcon,
    IonInput,
    IonButton,
    IonSpinner
  ]
})
export class LoginPage {
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly toastController = inject(ToastController);

  enviando = false;

  readonly loginForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)]
    })
  });

  constructor() {
    addIcons({ scanCircleOutline, scanOutline, mailOutline, lockClosedOutline });
  }

  iniciarSesion(): void {
    if (this.loginForm.invalid || this.enviando) {
      this.loginForm.markAllAsTouched();
      return;
    }

    const { email, password } = this.loginForm.getRawValue();
    this.enviando = true;

    this.authService.login(email, password).subscribe({
      next: async respuesta => {
        this.enviando = false;
        await this.mostrarMensaje(
          respuesta.mensaje || 'Sesión iniciada correctamente',
          'success'
        );
        await this.router.navigate(['/inicio']);
      },
      error: async err => {
        this.enviando = false;
        const mensajeError = err.error?.error || 'Error al conectar con el servidor';
        await this.mostrarMensaje(mensajeError, 'danger');
      }
    });
  }

  iniciarAccesoFacial(): void {
    if (this.enviando) return;
    this.authService.cerrarSesion();
    void this.router.navigate(['/login-facial']);
  }

  private async mostrarMensaje(mensaje: string, color: string): Promise<void> {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 2000,
      color,
      position: 'top'
    });
    await toast.present();
  }
}
