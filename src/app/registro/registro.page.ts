import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormGroup, FormControl, Validators } from '@angular/forms';
import { HttpClient, HttpClientModule } from '@angular/common/http';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';

import { 
  IonContent,
  IonCard,
  IonCardContent,
  IonItem,
  IonIcon,
  IonInput,
  IonButton,
  ToastController,
  NavController
} from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';
import { 
  personAddOutline, 
  personOutline, 
  mailOutline, 
  lockClosedOutline, 
  checkmarkCircleOutline,
  cameraOutline 
} from 'ionicons/icons';

@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
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
export class RegistroPage {
  
  private router = inject(Router);
  private navCtrl = inject(NavController); // Inyectamos NavController de Ionic
  private toastController = inject(ToastController);
  private http = inject(HttpClient);

  private readonly backendHost = 'https://app-facial.vercel.app';
  private API_URL = `${this.backendHost}/register`;

  constructor() {
    addIcons({ 
      personAddOutline, 
      personOutline, 
      mailOutline, 
      lockClosedOutline, 
      checkmarkCircleOutline,
      cameraOutline
    });
  }

  fotoBase64: string | undefined = undefined;

  registroForm = new FormGroup({
    nombre: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    password: new FormControl('', [Validators.required, Validators.minLength(6)]),
    confirmPassword: new FormControl('', [Validators.required])
  });


  async tomarFotoRegistro() {
    // Intentar usar la API de Camera de Capacitor, pero fallar con gracia y ofrecer un input file como fallback.
    try {
      // Evitar usar Camera.getPhoto con source CameraSource.Camera en plataforma web porque puede instanciar pwa-camera-modal
      const platform = (Capacitor && typeof Capacitor.getPlatform === 'function') ? Capacitor.getPlatform() : 'web';
      if (platform === 'web') {
        console.warn('Plataforma web detectada: usando selector de archivos en lugar de Camera.getPhoto para evitar errores de pwa-camera-modal.');
        await this.abrirSelectorArchivos();
        return;
      }

      if (Camera && Camera.getPhoto) {
        try {
          const image: any = await Camera.getPhoto({
            quality: 90,
            allowEditing: false,
            resultType: CameraResultType.Base64,
            source: CameraSource.Camera
          });

          const base64 = image?.base64String;
          if (base64) {
            this.fotoBase64 = `data:image/jpeg;base64,${base64}`;
            await this.mostrarMensaje('Foto facial capturada correctamente', 'success');
            return;
          } else {
            console.warn('Camera.getPhoto devolvió respuesta sin base64, usando selector de archivos como fallback.');
          }
        } catch (camErr) {
          // Si ocurre cualquier error al abrir la cámara (por ejemplo en web), se usa fallback.
          console.warn('Error usando Camera.getPhoto, fallback a selector de archivos:', camErr);
        }
      } else {
        console.warn('Camera API no disponible, usando selector de archivos como fallback.');
      }

      // Fallback: abrir un input[type=file] dinámico para que el usuario seleccione o tome una foto desde el navegador.
      await this.abrirSelectorArchivos();
    } catch (error) {
      console.error('Error en tomarFotoRegistro:', error);
      await this.mostrarMensaje('Se produjo un error al intentar obtener la foto', 'warning');
    }
  }

  // Helper: abre un input file dinámicamente y convierte la imagen seleccionada a data URL (base64)
  abrirSelectorArchivos(): Promise<void> {
    return new Promise((resolve) => {
      try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.style.display = 'none';

        input.onchange = async (ev: any) => {
          const file: File = ev.target.files && ev.target.files[0];
          if (!file) {
            await this.mostrarMensaje('No se seleccionó ninguna imagen', 'warning');
            resolve();
            return;
          }

          const reader = new FileReader();
          reader.onload = async () => {
            const result = reader.result as string | ArrayBuffer | null;
            if (typeof result === 'string') {
              // result ya es data URL: data:image/..;base64,...
              this.fotoBase64 = result;
              await this.mostrarMensaje('Imagen seleccionada correctamente', 'success');
            } else {
              await this.mostrarMensaje('No se pudo leer la imagen seleccionada', 'danger');
            }
            resolve();
          };
          reader.onerror = async (e) => {
            console.error('FileReader error:', e);
            await this.mostrarMensaje('Error al leer la imagen', 'danger');
            resolve();
          };
          reader.readAsDataURL(file);
        };

        // Añadir al DOM temporalmente para poder disparar el diálogo en algunos navegadores (opcional)
        document.body.appendChild(input);
        input.click();

        // Limpiar el input cuando se cierre el diálogo (no siempre es detectable), pero removerlo tras un tiempo prudente.
        setTimeout(() => {
          if (input.parentNode) input.parentNode.removeChild(input);
        }, 5000);
      } catch (e) {
        console.error('Error al abrir selector de archivos:', e);
        this.mostrarMensaje('No se pudo abrir el selector de archivos', 'danger');
        resolve();
      }
    });
  }

  async registrarUsuario() {
    const nombre = this.registroForm.get('nombre')?.value?.toString().trim() || '';
    const email = this.registroForm.get('email')?.value?.toString().trim() || '';
    const password = this.registroForm.get('password')?.value || '';
    const confirmPassword = this.registroForm.get('confirmPassword')?.value || '';

    if (password !== confirmPassword) {
      await this.mostrarMensaje('Las contraseñas no coinciden', 'danger');
      return;
    }

    if (!this.fotoBase64) {
      await this.mostrarMensaje('Debes tomarte una foto para el reconocimiento facial', 'danger');
      return;
    }
    
    const datosUsuario = {
      nombre,
      email,
      password,
      // Enviamos tanto la data URL como la base64 cruda por compatibilidad
      foto: this.fotoBase64,
      fotoBase64: this.fotoBase64.startsWith('data:') ? this.fotoBase64.split(',')[1] : this.fotoBase64
    };

    this.http.post(this.API_URL, datosUsuario).subscribe({
      next: async (respuesta: any) => {
        await this.mostrarMensaje('Cuenta creada con éxito', 'success');
        this.registroForm.reset();
        this.fotoBase64 = undefined; 
        
        // Usamos navCtrl.navigateRoot para forzar el cambio de pantalla al login
        this.navCtrl.navigateRoot('/login');
      },
      error: async (err) => {
        console.error('Error registrarUsuario:', err);
        const mensajeError = err.error?.error || 'Error al registrar usuario';
        await this.mostrarMensaje(mensajeError, 'danger');
      }
    });
  }

  // Método explícito para redirigir al login
  irALogin() {
    this.navCtrl.navigateBack('/login');
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