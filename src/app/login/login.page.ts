import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

import { 
  IonContent, 
  IonCard, 
  IonCardContent, 
  IonItem, 
  IonIcon, 
  IonInput, 
  IonButton,
  NavController,
  ToastController 
} from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';
import { scanCircleOutline, mailOutline, lockClosedOutline } from 'ionicons/icons';

@Component({
  selector: 'app-login',
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
  standalone: true,
  imports: [
    RouterLink,
    ReactiveFormsModule,
    HttpClientModule,
    IonContent, 
    IonCard, 
    IonCardContent, 
    IonItem, 
    IonIcon, 
    IonInput, 
    IonButton
  ] 
})
export class LoginPage {
  private router = inject(Router);
  private navCtrl = inject(NavController); 
  private http = inject(HttpClient); 
  private toastController = inject(ToastController);

  private API_URL = 'https://app-facial.vercel.app/login';

  // Agregamos Validators.required para que el botón se desactive si están vacíos
  loginForm = new FormGroup({
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', Validators.required)
  });

  constructor() {
    addIcons({ scanCircleOutline, mailOutline, lockClosedOutline });
  }

  iniciarSesion() {
    if (this.loginForm.invalid) {
      return; // Bloqueo de seguridad adicional por si burlan el HTML
    }

    const correoIngresado = this.loginForm.value.email;
    const passwordIngresado = this.loginForm.value.password;
    
    const credenciales = { email: correoIngresado, password: passwordIngresado };

    this.http.post(this.API_URL, credenciales).subscribe({
      next: async (respuesta: any) => {
        await this.mostrarMensaje(respuesta.mensaje, 'success');
        
        // Guardamos el correo en localStorage
        const emailAUsar = respuesta.usuario || correoIngresado;
        localStorage.setItem('emailUsuarioActivo', emailAUsar);
        
        // Redirigimos de forma limpia, SIN queryParams
        this.navCtrl.navigateRoot('/inicio');
      },
      error: async (err) => {
        const mensajeError = err.error?.error || 'Error al conectar con el servidor';
        await this.mostrarMensaje(mensajeError, 'danger');
      }
    });
  }

  async mostrarMensaje(mensaje: string, color: string) {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 2000,
      color: color,
      position: 'top'
    });
    await toast.present();
  }
}