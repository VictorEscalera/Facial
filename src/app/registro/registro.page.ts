import { Component, inject, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common'; // <-- IMPORTANTE PARA EL *ngIf
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
  NavController, IonNote, IonText } from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';
import { 
  personAddOutline, 
  personOutline, 
  mailOutline, 
  lockClosedOutline, 
  checkmarkCircleOutline,
  cameraOutline,
  closeOutline // <-- Nuevo icono agregado
} from 'ionicons/icons';

@Component({
  selector: 'app-registro',
  templateUrl: './registro.page.html',
  styleUrls: ['./registro.page.scss'],
  standalone: true,
  imports: [IonText, IonNote, 
    CommonModule, // <-- Agregado para habilitar directivas de Angular
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
  private navCtrl = inject(NavController); 
  private toastController = inject(ToastController);
  private http = inject(HttpClient);

  private readonly backendHost = 'https://app-facial.vercel.app';
  private API_URL = `${this.backendHost}/register`;

  // Variables para la cámara WebRTC
  camaraActiva = false;
  mediaStream: MediaStream | null = null;
  @ViewChild('videoElement') videoElement!: ElementRef<HTMLVideoElement>;

  constructor() {
    addIcons({ 
      personAddOutline, 
      personOutline, 
      mailOutline, 
      lockClosedOutline, 
      checkmarkCircleOutline,
      cameraOutline,
      closeOutline
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
    try {
      const platform = (Capacitor && typeof Capacitor.getPlatform === 'function') ? Capacitor.getPlatform() : 'web';
      
      if (platform === 'web') {
        // En computadora (web), activamos la cámara del navegador
        await this.iniciarCamaraWeb();
        return;
      }

      // En móvil (Android/iOS), usamos el plugin nativo de Capacitor
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
          } 
        } catch (camErr) {
          console.warn('Error usando Camera nativa:', camErr);
        }
      } 

      // Fallback extremo por si todo falla
      await this.abrirSelectorArchivos();
    } catch (error) {
      console.error('Error en tomarFotoRegistro:', error);
      await this.mostrarMensaje('Se produjo un error al intentar obtener la foto', 'warning');
    }
  }

  // --- LÓGICA DE CÁMARA WEB PARA PC ---

  async iniciarCamaraWeb() {
    try {
      // Solicitamos acceso a la cámara frontal (user)
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'user' } 
      });
      this.camaraActiva = true;
      
      // Esperamos un tick para que Angular renderice el <video>
      setTimeout(() => {
        if (this.videoElement && this.videoElement.nativeElement) {
          this.videoElement.nativeElement.srcObject = this.mediaStream;
        }
      }, 100);
    } catch (err) {
      console.warn('Cámara web no disponible, abriendo selector de archivos', err);
      // Si no tiene cámara o no da permisos, cae al explorador de archivos
      await this.abrirSelectorArchivos(); 
    }
  }

  capturarDeVideo() {
    if (!this.videoElement) return;
    const video = this.videoElement.nativeElement;
    
    // Creamos un canvas para tomar la foto del frame actual del video
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    
    if (ctx) {
      // --- SOLUCIÓN AL EFECTO ESPEJO ---
      // Movemos el punto de origen al lado derecho del canvas
      ctx.translate(canvas.width, 0);
      // Invertimos la escala horizontalmente
      ctx.scale(-1, 1);
      // ---------------------------------

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      this.fotoBase64 = canvas.toDataURL('image/jpeg'); // Extrae a base64
      this.mostrarMensaje('Foto facial capturada correctamente', 'success');
    }
    
    this.cerrarCamara();
  }

  cerrarCamara() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    this.camaraActiva = false;
  }

  // --- LÓGICA DE ARCHIVOS COMO FALLBACK ---

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
            const result = reader.result as string;
            this.fotoBase64 = result;
            await this.mostrarMensaje('Imagen seleccionada correctamente', 'success');
            resolve();
          };
          reader.onerror = async () => {
            await this.mostrarMensaje('Error al leer la imagen', 'danger');
            resolve();
          };
          reader.readAsDataURL(file);
        };
        document.body.appendChild(input);
        input.click();
        setTimeout(() => { if (input.parentNode) input.parentNode.removeChild(input); }, 5000);
      } catch (e) {
        resolve();
      }
    });
  }

  // --- REGISTRO Y UTILIDADES ---

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
      foto: this.fotoBase64,
      fotoBase64: this.fotoBase64.startsWith('data:') ? this.fotoBase64.split(',')[1] : this.fotoBase64
    };

    this.http.post(this.API_URL, datosUsuario).subscribe({
      next: async (respuesta: any) => {
        await this.mostrarMensaje('Cuenta creada con éxito', 'success');
        this.registroForm.reset();
        this.fotoBase64 = undefined; 
        this.navCtrl.navigateRoot('/login');
      },
      error: async (err) => {
        const mensajeError = err.error?.error || 'Error al registrar usuario';
        await this.mostrarMensaje(mensajeError, 'danger');
      }
    });
  }

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