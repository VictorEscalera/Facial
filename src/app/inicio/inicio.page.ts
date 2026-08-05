import { AfterViewInit, Component, inject, NgZone, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import type * as FaceApi from '@vladmandic/face-api';
import { addIcons } from 'ionicons';
import { scanOutline, logOutOutline } from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { FaceRecognitionService } from '../services/face-recognition.service';
import { NavController } from '@ionic/angular';

type FaceApiModule = typeof import('@vladmandic/face-api');

@Component({
  selector: 'app-inicio',
  templateUrl: './inicio.page.html',
  styleUrls: ['./inicio.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class InicioPage implements AfterViewInit, OnDestroy {
  
  public isLoadingModels = signal<boolean>(true);
  public isRecognitionReady = signal<boolean>(false);
  public statusMessage = signal<string>('Cargando redes neuronales...');
  public matchResult = signal<string>('');
  
  public urlFotoReferencia = signal<string>(''); 

  private readonly remoteBackendRoot = 'https://app-facial.vercel.app';
  private readonly ngZone = inject(NgZone);
  private readonly faceRecognition = inject(FaceRecognitionService);
  private streamCamara: MediaStream | null = null;
  private faceApi: FaceApiModule | null = null;
  private readonly navCtrl = inject(NavController);
  
  private intervaloEscaneo?: ReturnType<typeof setInterval>;
  private escaneoEnCurso = false;
  private faceMatcher: FaceApi.FaceMatcher | null = null;
  private referenciasPreparadas = false;
  private vistaActiva = true;
  private activandoReconocimiento = false;
  private accesoEnCurso = false;
  private accesoSolicitadoParaRostroActual = false;

  constructor() {
    addIcons({ scanOutline, logOutOutline });
  }

  async ngAfterViewInit() {
    try {
      const emailActivo = localStorage.getItem('emailUsuarioActivo');
      if (emailActivo) {
        this.urlFotoReferencia.set(`${this.remoteBackendRoot}/foto/${encodeURIComponent(emailActivo)}`);
      } else {
        throw new Error('No hay usuario activo en sesión.');
      }

      await this.esperarPintadoInicial();
      await this.cargarModelosIA();
      await this.crearDescriptoresReferencia();
      this.referenciasPreparadas = true;
      this.isRecognitionReady.set(true);
      this.isLoadingModels.set(false);
      await this.esperarPintadoInicial();

      if (this.vistaActiva) {
        await this.activarReconocimiento();
      }
    } catch (error) {
      console.error('[FaceAPI] Error al inicializar el reconocimiento facial:', error);
      this.isRecognitionReady.set(false);
      this.isLoadingModels.set(false);
      this.statusMessage.set('Error al inicializar el reconocimiento facial.');
    }
  }

  private esperarPintadoInicial(): Promise<void> {
    return new Promise(resolve => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
  }

  async ionViewDidEnter() {
    this.vistaActiva = true;
    if (this.referenciasPreparadas) {
      await this.activarReconocimiento();
    }
  }

  ionViewWillLeave() {
    this.vistaActiva = false;
    this.detenerReconocimiento();
  }

  ngOnDestroy() {
    this.vistaActiva = false;
    this.detenerReconocimiento();
  }

  private async activarReconocimiento() {
    if (
      !this.vistaActiva ||
      this.activandoReconocimiento ||
      this.streamCamara ||
      this.intervaloEscaneo
    ) {
      return;
    }

    this.activandoReconocimiento = true;
    try {
      await this.encenderCamara();

      if (!this.vistaActiva) {
        this.apagarCamara();
        return;
      }

      this.statusMessage.set('IA lista. Búsqueda de rostros iniciada.');
      this.iniciarBucleDeEscaneo();
    } catch (error) {
      console.error('[FaceAPI] No se pudo activar el reconocimiento:', error);
    } finally {
      this.activandoReconocimiento = false;
    }
  }

  private detenerReconocimiento() {
    if (this.intervaloEscaneo) {
      clearInterval(this.intervaloEscaneo);
      this.intervaloEscaneo = undefined;
    }
    this.accesoSolicitadoParaRostroActual = false;
    this.apagarCamara();
  }

  async encenderCamara() {
    try {
      const videoElement = document.getElementById('videoCamara') as HTMLVideoElement | null;
      if (!videoElement) {
        throw new Error('No se encontró el elemento #videoCamara.');
      }

      this.streamCamara = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }
      });
      videoElement.srcObject = this.streamCamara;
      await videoElement.play();
    } catch (error) {
      console.error('[FaceAPI] Error con la cámara:', error);
      this.statusMessage.set('No se pudo acceder a la cámara.');
      throw error;
    }
  }

  async cargarModelosIA() {
    try {
      await this.faceRecognition.cargarModelos();
      this.faceApi = await this.faceRecognition.obtenerFaceApi();
    } catch (error) {
      console.error('[FaceAPI] Error cargando IA:', error);
      this.statusMessage.set('Error al cargar los modelos de IA.');
      throw error;
    }
  }

  private async crearDescriptoresReferencia() {
    const faceapi = this.obtenerFaceApiCargada();
    
    // 🔥 ELIMINAMOS LA LECTURA DE LA CACHÉ AQUÍ
    // Ya no usamos this.faceRecognition.obtenerFaceMatcher()
    // Obligamos a la app a leer siempre la foto nueva del DOM (que corresponde al nuevo email)

    const referencias = [
      { id: 'imagenReferencia', etiqueta: 'Usuario' },
    ];
    const descriptores: FaceApi.LabeledFaceDescriptors[] = [];

    for (const referencia of referencias) {
      const imagen = document.getElementById(referencia.id) as HTMLImageElement | null;
      if (!imagen) {
        throw new Error(`No se encontró la imagen #${referencia.id}.`);
      }
      
      const img = imagen as HTMLImageElement;

      if (!img.complete || img.naturalWidth === 0) {
        await new Promise<void>((resolve, reject) => {
          const onLoad = () => {
            cleanup();
            resolve();
          };
          const onError = () => {
            cleanup();
            reject(new Error(`No se pudo cargar la imagen de referencia: ${img.src}`));
          };
          const timer = window.setTimeout(() => {
            cleanup();
            reject(new Error(`Timeout al cargar la imagen de referencia: ${img.src}`));
          }, 8000);

          function cleanup() {
            img.onload = null;
            img.onerror = null;
            clearTimeout(timer);
          }

          img.onload = onLoad;
          img.onerror = onError;
        });
        await img.decode();
      }

      const deteccion = await faceapi
        .detectSingleFace(img)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!deteccion) {
        throw new Error(`No se detectó un rostro en la foto de perfil (${img.src}).`);
      }

      descriptores.push(
        new faceapi.LabeledFaceDescriptors(referencia.etiqueta, [deteccion.descriptor])
      );
    }

    this.faceMatcher = new faceapi.FaceMatcher(descriptores, 0.5);
    
    // Sobreescribimos cualquier caché viejo en el servicio
    try {
      this.faceRecognition.guardarFaceMatcher(this.faceMatcher);
    } catch (e) {
      console.warn("No se pudo sobreescribir el FaceMatcher en el servicio.");
    }
  }

  private obtenerFaceApiCargada(): FaceApiModule {
    if (!this.faceApi) {
      throw new Error('FaceAPI todavía no está inicializada.');
    }
    return this.faceApi;
  }

  iniciarBucleDeEscaneo() {
    this.ngZone.runOutsideAngular(() => {
      void this.escanearConIA();
      this.intervaloEscaneo = setInterval(() => {
        void this.escanearConIA();
      }, 5000);
    });
  }

  async escanearConIA() {
    if (this.accesoEnCurso) return; 
    if (this.escaneoEnCurso) return;

    const videoCamara = document.getElementById('videoCamara') as HTMLVideoElement | null;
    if (!videoCamara || !this.faceMatcher) return;
    if (videoCamara.paused || videoCamara.ended || videoCamara.readyState < 2) return;

    this.escaneoEnCurso = true;
    this.ngZone.run(() => {
      this.statusMessage.set('Analizando biometría en vivo...');
    });

    try {
      const faceapi = this.obtenerFaceApiCargada();
      const deteccionesVivo = await faceapi
        .detectAllFaces(videoCamara)
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (!this.vistaActiva) return;

      if (deteccionesVivo.length === 0) {
        this.accesoSolicitadoParaRostroActual = false;
        this.ngZone.run(() => {
          this.statusMessage.set('Esperando sujeto en el marco...');
          this.matchResult.set('');
        });
        return;
      }

      const coincidencias = deteccionesVivo.map(deteccion =>
        this.faceMatcher!.findBestMatch(deteccion.descriptor)
      );

      const coincidencia = coincidencias.reduce((mejor, actual) =>
        actual.distance < mejor.distance ? actual : mejor
      );

      if (coincidencia.label !== 'unknown') {
        this.ngZone.run(() => {
          this.matchResult.set('¡ACCESO EXITOSO!');
          this.statusMessage.set(`Identidad verificada: ${coincidencia.label}.`);
        });

        if (!this.accesoSolicitadoParaRostroActual && !this.accesoEnCurso) {
          this.accesoSolicitadoParaRostroActual = true;
          void this.abrirPuertaServomotores();
        }

      } else {
        this.accesoSolicitadoParaRostroActual = false;
        this.ngZone.run(() => {
          this.matchResult.set('¡ACCESO DENEGADO!');
          this.statusMessage.set('Rostro desconocido (Intruso bloqueado).');
        });
      }

    } catch (error) {
      console.error('[FaceAPI] Error durante el escaneo:', error);
      if (this.vistaActiva) {
        this.ngZone.run(() => {
          this.statusMessage.set('Error durante el análisis facial.');
        });
      }
    } finally {
      this.escaneoEnCurso = false;
    }
  }

  async abrirPuertaServomotores() {
    if (this.accesoEnCurso) return;

    this.accesoEnCurso = true;
    this.ngZone.run(() => {
      this.statusMessage.set('Acceso autorizado. Ejecutando apertura física...');
    });

    try {
      const localBackendUrl = 'http://localhost:5001/abrir-puerta';
      
      const response = await fetch(localBackendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ accion: 'abrir', usuario: 'Verificado' })
      });

      if (!response.ok) {
        throw new Error(`Error HTTP ${response.status} en el servidor local.`);
      }

      this.ngZone.run(() => {
        this.statusMessage.set('Acceso completado. Puerta abierta.');
      });

    } catch (error) {
      console.error('Error al contactar con el hardware local:', error);
      this.accesoSolicitadoParaRostroActual = false;
      this.ngZone.run(() => {
        this.statusMessage.set('Fallo de conexión con el Arduino local.');
      });
    } finally {
      setTimeout(() => {
        this.accesoEnCurso = false;
      }, 4000);
    }
  }

  apagarCamara() {
    if (this.streamCamara) {
      this.streamCamara.getTracks().forEach(track => track.stop());
      this.streamCamara = null;
    }

    const videoElement = document.getElementById('videoCamara') as HTMLVideoElement | null;
    if (videoElement) {
      videoElement.srcObject = null;
    }
  }

  async cerrarSesion() {
    this.vistaActiva = false;
    this.detenerReconocimiento();
    
    localStorage.clear();
    
    // 🔥 LIMPIAMOS LAS VARIABLES DE MEMORIA DE LA IA
    this.faceMatcher = null; 
    try {
      // Intentamos vaciar también la memoria del servicio global si es posible
      (this.faceRecognition as any).guardarFaceMatcher(null);
    } catch (e) {}

    this.matchResult.set('');
    this.statusMessage.set('Sesión finalizada.');

    await this.navCtrl.navigateRoot('/login');
  }
}