import { AfterViewInit, Component, inject, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import type * as FaceApi from '@vladmandic/face-api';
import { addIcons } from 'ionicons';
import { arrowBackOutline, scanOutline } from 'ionicons/icons';
import { AuthService } from '../services/auth.service';
import { FaceRecognitionService } from '../services/face-recognition.service';

type FaceApiModule = typeof import('@vladmandic/face-api');

@Component({
  selector: 'app-login-facial',
  templateUrl: './login-facial.page.html',
  styleUrls: ['./login-facial.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class LoginFacialPage implements AfterViewInit, OnDestroy {
  readonly cargando = signal(true);
  readonly lista = signal(false);
  readonly mensaje = signal('Preparando inicio de sesión facial...');
  readonly resultado = signal('');

  private readonly authService = inject(AuthService);
  private readonly faceRecognition = inject(FaceRecognitionService);
  private readonly router = inject(Router);
  private faceApi: FaceApiModule | null = null;
  private faceMatcher: FaceApi.FaceMatcher | null = null;
  private stream: MediaStream | null = null;
  private intervalo?: ReturnType<typeof setInterval>;
  private escaneoEnCurso = false;
  private referenciasPreparadas = false;
  private vistaActiva = true;
  private navegando = false;

  constructor() {
    addIcons({ arrowBackOutline, scanOutline });
  }

  async ngAfterViewInit(): Promise<void> {
    try {
      await this.esperarPintado();
      await this.faceRecognition.cargarModelos();
      this.faceApi = await this.faceRecognition.obtenerFaceApi();
      await this.prepararIdentidades();
      this.referenciasPreparadas = true;
      this.lista.set(true);
      this.cargando.set(false);
      await this.esperarPintado();
      await this.activarCamara();
    } catch (error) {
      console.error('[Login facial] Error de inicialización:', error);
      this.cargando.set(false);
      this.lista.set(false);
      this.mensaje.set('No fue posible iniciar el reconocimiento facial.');
    }
  }

  async ionViewDidEnter(): Promise<void> {
    this.vistaActiva = true;
    if (this.referenciasPreparadas && !this.stream) {
      await this.activarCamara();
    }
  }

  ionViewWillLeave(): void {
    this.vistaActiva = false;
    this.detenerCamara();
  }

  ngOnDestroy(): void {
    this.vistaActiva = false;
    this.detenerCamara();
  }

  volver(): void {
    this.vistaActiva = false;
    this.detenerCamara();
    void this.router.navigate(['/login'], { replaceUrl: true });
  }

  private esperarPintado(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  private async prepararIdentidades(): Promise<void> {
    const matcherGuardado = this.faceRecognition.obtenerFaceMatcher();
    if (matcherGuardado) {
      this.faceMatcher = matcherGuardado;
      return;
    }

    const faceapi = this.obtenerFaceApi();
    const referencias = [
      { id: 'loginImagenUsuario', etiqueta: 'Usuario' },
      { id: 'loginImagenSergio', etiqueta: 'Sergio' }
    ];
    const descriptores: FaceApi.LabeledFaceDescriptors[] = [];
    const opciones = new faceapi.TinyFaceDetectorOptions({
      inputSize: 320,
      scoreThreshold: 0.45
    });

    for (const referencia of referencias) {
      const imagen = document.getElementById(referencia.id) as HTMLImageElement | null;
      if (!imagen) throw new Error(`No se encontró #${referencia.id}.`);
      if (!imagen.complete || imagen.naturalWidth === 0) await imagen.decode();

      const deteccion = await faceapi
        .detectSingleFace(imagen, opciones)
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      if (!deteccion) throw new Error(`No se detectó un rostro en ${referencia.id}.`);

      descriptores.push(
        new faceapi.LabeledFaceDescriptors(referencia.etiqueta, [deteccion.descriptor])
      );
    }

    this.faceMatcher = new faceapi.FaceMatcher(descriptores, 0.5);
    this.faceRecognition.guardarFaceMatcher(this.faceMatcher);
  }

  private async activarCamara(): Promise<void> {
    if (!this.vistaActiva || this.stream || this.navegando) return;
    const video = document.getElementById('videoLoginFacial') as HTMLVideoElement | null;
    if (!video) throw new Error('No se encontró #videoLoginFacial.');

    this.stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: 'user',
        width: { ideal: 320 },
        height: { ideal: 240 },
        frameRate: { ideal: 15, max: 24 }
      }
    });
    video.srcObject = this.stream;
    await video.play();
    this.mensaje.set('Mira a la cámara para iniciar sesión.');
    void this.escanear();
    this.intervalo = setInterval(() => void this.escanear(), 1500);
  }

  private async escanear(): Promise<void> {
    if (this.escaneoEnCurso || this.navegando || !this.vistaActiva || !this.faceMatcher) return;
    const video = document.getElementById('videoLoginFacial') as HTMLVideoElement | null;
    if (!video || video.paused || video.readyState < 2) return;

    this.escaneoEnCurso = true;
    try {
      const faceapi = this.obtenerFaceApi();
      const opciones = new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.45
      });
      const deteccion = await faceapi
        .detectSingleFace(video, opciones)
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      this.limpiarCanvas();

      if (!deteccion || !this.vistaActiva) {
        this.resultado.set('');
        this.mensaje.set('Mira de frente a la cámara.');
        return;
      }

      const coincidencia = this.faceMatcher.findBestMatch(deteccion.descriptor);
      this.dibujarResultado(video, deteccion, coincidencia);
      if (coincidencia.label === 'unknown') {
        this.resultado.set('IDENTIDAD NO RECONOCIDA');
        this.mensaje.set('El rostro no corresponde a un usuario registrado.');
        return;
      }

      this.navegando = true;
      this.resultado.set('IDENTIDAD VERIFICADA');
      this.mensaje.set(`Bienvenido, ${coincidencia.label}.`);
      this.authService.iniciarSesionFacial(coincidencia.label);
      await new Promise(resolve => setTimeout(resolve, 500));
      this.detenerCamara();
      await this.router.navigate(['/inicio'], { replaceUrl: true });
    } catch (error) {
      console.error('[Login facial] Error durante el análisis:', error);
      this.mensaje.set('Error durante el análisis facial.');
    } finally {
      this.escaneoEnCurso = false;
    }
  }

  private dibujarResultado(
    video: HTMLVideoElement,
    deteccion: FaceApi.WithFaceDescriptor<FaceApi.WithFaceLandmarks<{ detection: FaceApi.FaceDetection }>>,
    coincidencia: FaceApi.FaceMatch
  ): void {
    const faceapi = this.obtenerFaceApi();
    const canvas = document.getElementById('canvasLoginFacial') as HTMLCanvasElement | null;
    if (!canvas) return;
    const dimensiones = { width: video.videoWidth, height: video.videoHeight };
    faceapi.matchDimensions(canvas, dimensiones);
    const ajustada = faceapi.resizeResults(deteccion, dimensiones);
    const reconocida = coincidencia.label !== 'unknown';
    const cajaOriginal = ajustada.detection.box;
    const cajaReflejada = {
      x: dimensiones.width - cajaOriginal.x - cajaOriginal.width,
      y: cajaOriginal.y,
      width: cajaOriginal.width,
      height: cajaOriginal.height
    };
    new faceapi.draw.DrawBox(cajaReflejada, {
      label: reconocida ? coincidencia.label : 'Desconocido',
      boxColor: reconocida ? '#00e676' : '#ff1744'
    }).draw(canvas);
  }

  private obtenerFaceApi(): FaceApiModule {
    if (!this.faceApi) throw new Error('Face API todavía no está disponible.');
    return this.faceApi;
  }

  private limpiarCanvas(): void {
    const canvas = document.getElementById('canvasLoginFacial') as HTMLCanvasElement | null;
    canvas?.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }

  private detenerCamara(): void {
    if (this.intervalo) clearInterval(this.intervalo);
    this.intervalo = undefined;
    this.stream?.getTracks().forEach(track => track.stop());
    this.stream = null;
    const video = document.getElementById('videoLoginFacial') as HTMLVideoElement | null;
    if (video) video.srcObject = null;
    this.limpiarCanvas();
  }
}
