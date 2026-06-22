import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';

// CORRECCIÓN: Importaciones INDIVIDUALES desde /standalone para Ionic 8
import { 
  IonContent,
  IonCard,
  IonCardContent,
  IonItem,
  IonIcon,
  IonInput,
  IonButton,
  ToastController // <-- Inyección standalone limpia
} from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';
import { 
  personAddOutline, 
  personOutline, 
  mailOutline, 
  lockClosedOutline, 
  checkmarkCircleOutline 
} from 'ionicons/icons';

@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
  standalone: true,
  // CORRECCIÓN: Declaramos individualmente los componentes visuales que usa tu HTML
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
export class RegistroPage {
  
  private router = inject(Router);
  private toastController = inject(ToastController);
  private http = inject(HttpClient);

  // URL local para tu prototipo (Cámbiala por la de Vercel al desplegar)
  private API_URL = 'https://app-facial.vercel.app/register'; 

  registroForm = new FormGroup({
    nombre: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(6)]),
    confirmPassword: new FormControl('', [Validators.required])
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

  async registrarUsuario() {
    const { nombre, email, password, confirmPassword } = this.registroForm.value;

    if (password !== confirmPassword) {
      this.mostrarMensaje('Las contraseñas no coinciden', 'danger');
      return;
    }
    
    // Objeto directo en texto plano para el backend prototipo
    const datosUsuario = {
      nombre: nombre,
      email: email,
      password: password
    };

    this.http.post(this.API_URL, datosUsuario).subscribe({
      next: async (respuesta: any) => {
        await this.mostrarMensaje('Cuenta creada con éxito', 'success');
        this.registroForm.reset(); 
        this.router.navigate(['/login']);
      },
      error: async (err) => {
        const mensajeError = err.error?.error || 'Error al registrar usuario';
        await this.mostrarMensaje(mensajeError, 'danger');
      }
    });
  }

  async mostrarMensaje(mensaje: string, color: string) {
    const toast = await this.toastController.create({
      message: mensaje,
      duration: 2000,
      color: color,
      position: 'top',
      cssClass: 'custom-toast'
    });
    await toast.present();
  }
}