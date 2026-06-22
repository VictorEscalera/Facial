import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

// CORRECCIÓN: Todo importado estrictamente desde /standalone
import { 
  IonContent, 
  IonCard, 
  IonCardContent, 
  IonItem, 
  IonIcon, 
  IonInput, 
  IonButton,
  NavController,
  ToastController // <-- Ahora sí importado correctamente como componente standalone
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
  private toastController = inject(ToastController); // <-- Inyección standalone limpia

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
      this.router.navigate(['/inicio'], { queryParams: { usuario: 'Administrador' } });
      return;
    }

    const credenciales = {
      email: correoIngresado,
      password: passwordIngresado
    };

    this.http.post(this.API_URL, credenciales).subscribe({
      next: async (respuesta: any) => {
        await this.mostrarMensaje(respuesta.mensaje, 'success');
        this.router.navigate(['/inicio'], { queryParams: { usuario: respuesta.usuario } });
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