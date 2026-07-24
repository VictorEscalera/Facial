import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  IonButton,
  IonCard,
  IonCardContent,
  IonContent,
  IonIcon,
  IonInput,
  IonItem,
  ToastController
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import {
  checkmarkCircleOutline,
  lockClosedOutline,
  mailOutline,
  personAddOutline,
  personOutline
} from 'ionicons/icons';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
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
    IonButton
  ]
})
export class RegistroPage {
  private readonly router = inject(Router);
  private readonly toastController = inject(ToastController);
  private readonly authService = inject(AuthService);

  enviando = false;

  readonly registroForm = new FormGroup({
    nombre: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)]
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email]
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)]
    }),
    confirmPassword: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required]
    })
  });

  constructor() {
    addIcons({
      personAddOutline,
      personOutline,
      mailOutline,
      lockClosedOutline,
      checkmarkCircleOutline
    });
  }

  registrarUsuario(): void {
    if (this.registroForm.invalid || this.enviando) {
      this.registroForm.markAllAsTouched();
      return;
    }

    const { nombre, email, password, confirmPassword } = this.registroForm.getRawValue();

    if (password !== confirmPassword) {
      void this.mostrarMensaje('Las contraseñas no coinciden', 'danger');
      return;
    }

    this.enviando = true;
    this.authService.registrar({ nombre, email, password }).subscribe({
      next: async () => {
        this.enviando = false;
        await this.mostrarMensaje('Cuenta creada con éxito', 'success');
        this.registroForm.reset();
        await this.router.navigate(['/login']);
      },
      error: async err => {
        this.enviando = false;
        const mensajeError = err.error?.error || 'Error al registrar usuario';
        await this.mostrarMensaje(mensajeError, 'danger');
      }
    });
  }

  private async mostrarMensaje(mensaje: string, color: string): Promise<void> {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 2000,
      color,
      position: 'top',
      cssClass: 'custom-toast'
    });
    await toast.present();
  }
}
