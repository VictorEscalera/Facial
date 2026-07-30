import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
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

  // Usamos el backend desplegado en Vercel por defecto.
  // Cambia a 'http://localhost:5001/login' solo si estás ejecutando una copia local de Flask.
  private API_URL = 'https://app-facial.vercel.app/login';

  loginForm = new FormGroup({
    email: new FormControl(''),
    password: new FormControl('')
  });

  constructor() {
    addIcons({ scanCircleOutline, mailOutline, lockClosedOutline });
  }

  iniciarSesion() {
    const correoIngresado = this.loginForm.value.email;
    const passwordIngresado = this.loginForm.value.password;
    
    if (!correoIngresado) {
      // Si entras sin correo (modo Admin)
      localStorage.setItem('emailUsuarioActivo', 'admin');
      this.navCtrl.navigateRoot('/inicio', { queryParams: { usuario: 'Administrador' } });
      return;
    }

    const credenciales = { email: correoIngresado, password: passwordIngresado };

    this.http.post(this.API_URL, credenciales).subscribe({
      next: async (respuesta: any) => {
        await this.mostrarMensaje(respuesta.mensaje, 'success');
        
        // 🔑 LÍNEA CLAVE: Guardamos el correo en la memoria local
        const emailAUsar = respuesta.usuario || correoIngresado;
        localStorage.setItem('emailUsuarioActivo', emailAUsar);
        
        // Redirigimos usando NavController para asegurar la recarga limpia
        this.navCtrl.navigateRoot('/inicio', { queryParams: { usuario: emailAUsar } });
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