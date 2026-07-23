import { AfterViewInit, Component, inject, NgZone, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonicModule } from '@ionic/angular';
import type * as FaceApi from '@vladmandic/face-api';
import { addIcons } from 'ionicons';
import { logOutOutline, scanOutline } from 'ionicons/icons';
import { Capacitor } from '@capacitor/core';
import { FaceRecognitionService } from '../services/face-recognition.service';
import { AuthService } from '../services/auth.service';

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
  private readonly ngZone = inject(NgZone);
  private readonly faceRecognition = inject(FaceRecognitionService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  readonly usuarioSesion = this.authService.usuario;
  private streamCamara: MediaStream | null = null;
  private faceApi: FaceApiModule | null = null;
  
  // 1. Creamos la variable para guardar el ID del temporizador
  private intervaloEscaneo?: ReturnType<typeof setInterval>;
  private escaneoEnCurso = false;
  private faceMatcher: FaceApi.FaceMatcher | null = null;
  private referenciasPreparadas = false;
  private vistaActiva = true;
  private activandoReconocimiento = false;
  private accesoEnCurso = false;
  private accesoSolicitadoParaRostroActual = false;
  private readonly ipPuenteEnDispositivo = '192.168.120.49';
  private readonly intervaloEscaneoMs = 1500;

  constructor() {
    // Evitamos el colapso de la URL inyectando el ícono en memoria
    addIcons({ scanOutline, logOutOutline });
  }

  async ngAfterViewInit() {
    if (!this.authService.estaAutenticado()) {
      this.vistaActiva = false;
      await this.router.navigate(['/login'], { replaceUrl: true });
      return;
    }

    try {
      // Cede dos frames para que Ionic pinte el indicador antes de iniciar TensorFlow.
      await this.esperarPintadoInicial();
      await this.cargarModelosIA();
      await this.crearDescriptoresReferencia();
      this.referenciasPreparadas = true;
      this.isRecognitionReady.set(true);
      this.isLoadingModels.set(false);
      // El video se crea con el bloque @else; esperamos a que Angular lo renderice.
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

      // El permiso puede resolverse después de que el usuario abandone la página.
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
      const videoElement = document.getElementById('videoPuerta') as HTMLVideoElement | null;
      if (!videoElement) {
        throw new Error('No se encontró el elemento #videoPuerta.');
      }

      this.streamCamara = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 320 },
          height: { ideal: 240 },
          frameRate: { ideal: 15, max: 24 }
        }
      });
      videoElement.srcObject = this.streamCamara;
      await videoElement.play();
      console.log('[FaceAPI] Cámara lista:', {
        id: videoElement.id,
        width: videoElement.videoWidth,
        height: videoElement.videoHeight
      });
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
      console.log('[FaceAPI] Modelos disponibles en InicioPage.');
      
    } catch (error) {
      console.error('[FaceAPI] Error cargando IA:', error);
      this.statusMessage.set('Error al cargar los modelos de IA.');
      throw error;
    }
  }

  private async crearDescriptoresReferencia() {
    const faceapi = this.obtenerFaceApiCargada();
    const inicioTotal = performance.now();
    const matcherEnMemoria = this.faceRecognition.obtenerFaceMatcher();
    if (matcherEnMemoria) {
      this.faceMatcher = matcherEnMemoria;
      console.log('[FaceAPI] Descriptores reutilizados desde memoria.');
      return;
    }

    const referencias = [
      { id: 'imagenReferencia', etiqueta: 'Usuario' },
      { id: 'imagenReferenciaCompanero', etiqueta: 'Sergio' }
    ];
    const descriptores: FaceApi.LabeledFaceDescriptors[] = [];

    for (const referencia of referencias) {
      const inicioReferencia = performance.now();
      const imagen = document.getElementById(referencia.id) as HTMLImageElement | null;
      if (!imagen) {
        throw new Error(`No se encontró la imagen #${referencia.id}.`);
      }

      if (!imagen.complete || imagen.naturalWidth === 0) {
        console.log(`[FaceAPI] Esperando que cargue #${referencia.id}...`);
        await imagen.decode();
      }

      const opcionesDetector = new faceapi.TinyFaceDetectorOptions({
        inputSize: 320,
        scoreThreshold: 0.45
      });
      const deteccion = await faceapi
        .detectSingleFace(imagen, opcionesDetector)
        .withFaceLandmarks(true)
        .withFaceDescriptor();

      if (!deteccion) {
        throw new Error(`No se detectó un rostro en #${referencia.id} (${imagen.src}).`);
      }

      descriptores.push(
        new faceapi.LabeledFaceDescriptors(referencia.etiqueta, [deteccion.descriptor])
      );
      console.log('[FaceAPI] Descriptores extraídos:', {
        id: referencia.id,
        etiqueta: referencia.etiqueta,
        longitud: deteccion.descriptor.length,
        tiempoMs: Math.round(performance.now() - inicioReferencia)
      });
    }

    this.faceMatcher = new faceapi.FaceMatcher(descriptores, 0.5);
    this.faceRecognition.guardarFaceMatcher(this.faceMatcher);
    console.log(
      '[FaceAPI] Descriptores extraídos y FaceMatcher listo:',
      {
        identidades: descriptores.map(descriptor => descriptor.label),
        tiempoTotalMs: Math.round(performance.now() - inicioTotal)
      }
    );
    this.faceRecognition.registrarDiagnostico('descriptores preparados');
  }

  private obtenerFaceApiCargada(): FaceApiModule {
    if (!this.faceApi) {
      throw new Error('FaceAPI todavía no está inicializada.');
    }
    return this.faceApi;
  }

  // 4. Esta es la función que hace el ciclo cada 5000 milisegundos (5 segundos)
  iniciarBucleDeEscaneo() {
    this.ngZone.runOutsideAngular(() => {
      void this.escanearConIA();
      this.intervaloEscaneo = setInterval(() => {
        void this.escanearConIA();
      }, this.intervaloEscaneoMs);
    });
  }

  async escanearConIA() {
    if (this.accesoEnCurso) {
      console.log('[FaceAPI] Escaneo pausado: Arduino ejecutando la secuencia de acceso.');
      return;
    }

    if (this.escaneoEnCurso) {
      console.log('[FaceAPI] Escaneo omitido: el ciclo anterior sigue en curso.');
      return;
    }

    const videoCamara = document.getElementById('videoPuerta') as HTMLVideoElement | null;
    if (!videoCamara) {
      console.error('[FaceAPI] No se encontró el video #videoPuerta.');
      return;
    }
    if (!this.faceMatcher) {
      console.error('[FaceAPI] No hay descriptores de referencia preparados.');
      return;
    }
    if (videoCamara.paused || videoCamara.ended || videoCamara.readyState < 2) {
      console.log('[FaceAPI] Video aún no listo:', {
        paused: videoCamara.paused,
        ended: videoCamara.ended,
        readyState: videoCamara.readyState
      });
      return;
    }

    this.escaneoEnCurso = true;
    this.ngZone.run(() => {
      this.statusMessage.set('Analizando biometría en vivo...');
    });

    try {
      const faceapi = this.obtenerFaceApiCargada();
      const inicioInferencia = performance.now();
      const opcionesDetector = new faceapi.TinyFaceDetectorOptions({
        inputSize: 224,
        scoreThreshold: 0.45
      });
      console.log('[FaceAPI] Escaneando video:', videoCamara.id);
      const deteccionesVivo = await faceapi
        .detectSingleFace(videoCamara, opcionesDetector)
        .withFaceLandmarks(true)
        .withFaceDescriptor();
      this.limpiarCanvasDetecciones();
      console.log('[FaceAPI] Inferencia de cámara completada:', {
        rostros: deteccionesVivo ? 1 : 0,
        tiempoMs: Math.round(performance.now() - inicioInferencia)
      });

      // La inferencia no se puede cancelar; se descarta si la vista ya se cerró.
      if (!this.vistaActiva) {
        console.log('[FaceAPI] Resultado descartado: la vista ya no está activa.');
        return;
      }

      if (!deteccionesVivo) {
        console.log('[FaceAPI] No se detectó ningún rostro en cámara.');
        this.accesoSolicitadoParaRostroActual = false;
        this.ngZone.run(() => {
          this.statusMessage.set('Esperando sujeto en el marco...');
          this.matchResult.set('');
        });
        return;
      }

      console.log('[FaceAPI] Rostro detectado en cámara.');
      const coincidencias = [this.faceMatcher.findBestMatch(deteccionesVivo.descriptor)];

      const canvas = document.getElementById('canvasPuerta') as HTMLCanvasElement | null;
      if (canvas) {
        const dimensiones = {
          width: videoCamara.videoWidth,
          height: videoCamara.videoHeight
        };
        faceapi.matchDimensions(canvas, dimensiones);
        const deteccionRedimensionada = faceapi.resizeResults(deteccionesVivo, dimensiones);

        const coincidenciaActual = coincidencias[0];
        const reconocido = coincidenciaActual.label !== 'unknown';
        const etiqueta = reconocido ? coincidenciaActual.label : 'Desconocido';
        const cajaOriginal = deteccionRedimensionada.detection.box;
        const cajaReflejada = {
          x: dimensiones.width - cajaOriginal.x - cajaOriginal.width,
          y: cajaOriginal.y,
          width: cajaOriginal.width,
          height: cajaOriginal.height
        };
        const caja = new faceapi.draw.DrawBox(cajaReflejada, {
          label: etiqueta,
          boxColor: reconocido ? '#00e676' : '#ff1744'
        });
        caja.draw(canvas);
      }
      coincidencias.forEach((coincidencia, indice) => {
        console.log('[FaceAPI] Distancia de coincidencia:', {
          rostro: indice + 1,
          etiqueta: coincidencia.label,
          distancia: coincidencia.distance,
          umbral: 0.5
        });
      });

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
        } else {
          console.log('[FaceAPI] Apertura omitida: este rostro ya autorizó el acceso.');
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
          this.statusMessage.set('Error durante el análisis facial. Revisa la consola.');
        });
      }
    } finally {
      this.escaneoEnCurso = false;
    }
  }

  async abrirPuertaServomotores() {
    if (this.accesoEnCurso) return;

    this.accesoEnCurso = true;
    console.log('Señal de apertura iniciada, contactando al puente de hardware...');

    const hostPuente = Capacitor.isNativePlatform()
      ? this.ipPuenteEnDispositivo
      : window.location.hostname || 'localhost';
    const urlPuente = `http://${hostPuente}:5000/abrir-puerta`;
    console.log('URL del puente Arduino:', urlPuente);

    this.ngZone.run(() => {
      this.statusMessage.set('Acceso autorizado. Ejecutando apertura física...');
    });

    try {
      const response = await fetch(urlPuente, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = await response.json().catch(() => ({
        message: `Respuesta HTTP ${response.status}`
      }));

      if (!response.ok) {
        throw new Error(data.message || `Error HTTP ${response.status}`);
      }

      console.log('Respuesta final del circuito:', data);
      this.ngZone.run(() => {
        this.statusMessage.set('Acceso completado. Puerta cerrada y asegurada.');
      });
    } catch (error) {
      console.error('Error al contactar con el Arduino:', error);
      this.accesoSolicitadoParaRostroActual = false;
      const mensaje = error instanceof Error ? error.message : 'Error desconocido de hardware';
      this.ngZone.run(() => {
        this.statusMessage.set(`Fallo de hardware: ${mensaje}`);
      });
    } finally {
      // La respuesta del puente llega cuando Arduino confirma LISTO. A partir de
      // ese momento se permite reconocer de nuevo el mismo rostro u otro.
      this.accesoSolicitadoParaRostroActual = false;
      this.accesoEnCurso = false;

      if (this.vistaActiva) {
        void this.escanearConIA();
      }
    }
  }

  cerrarSesion(): void {
    this.vistaActiva = false;
    this.detenerReconocimiento();
    this.authService.cerrarSesion();
    void this.router.navigate(['/login'], { replaceUrl: true });
  }

  private limpiarCanvasDetecciones(): void {
    const canvas = document.getElementById('canvasPuerta') as HTMLCanvasElement | null;
    if (!canvas) return;
    const contexto = canvas.getContext('2d');
    contexto?.clearRect(0, 0, canvas.width, canvas.height);
  }

  apagarCamara() {
    if (this.streamCamara) {
      this.streamCamara.getTracks().forEach(track => track.stop());
      this.streamCamara = null;
    }

    const videoElement = document.getElementById('videoPuerta') as HTMLVideoElement | null;
    if (videoElement) {
      videoElement.srcObject = null;
    }
    this.limpiarCanvasDetecciones();
  }
}
