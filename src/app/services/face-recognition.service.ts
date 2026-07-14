import { Injectable } from '@angular/core';
import type * as FaceApi from '@vladmandic/face-api';

type FaceApiModule = typeof import('@vladmandic/face-api');

interface TensorFlowRuntime {
  enableProdMode(): void;
  getBackend(): string;
  memory(): {
    numBytes: number;
    numTensors: number;
    unreliable?: boolean;
  };
  ready(): Promise<void>;
  setBackend(backendName: 'wasm' | 'cpu'): Promise<boolean>;
  setWasmPaths(path: string): void;
}

@Injectable({ providedIn: 'root' })
export class FaceRecognitionService {
  private readonly modelUrl = 'assets/models';
  private readonly wasmUrl = 'assets/tfjs-wasm/';
  private faceApiPromise: Promise<FaceApiModule> | null = null;
  private configuracionBackendPromise: Promise<void> | null = null;
  private cargaModelosPromise: Promise<void> | null = null;
  private faceMatcher: FaceApi.FaceMatcher | null = null;

  async cargarModelos(): Promise<void> {
    const faceapi = await this.obtenerFaceApi();
    await this.configurarBackend(faceapi);

    if (this.modelosCargados(faceapi)) {
      console.log('[FaceAPI] Modelos reutilizados desde memoria.');
      return;
    }

    if (!this.cargaModelosPromise) {
      this.cargaModelosPromise = this.cargarModelosPendientes(faceapi).catch(error => {
        // Permite reintentar si una descarga o inicializacion falla.
        this.cargaModelosPromise = null;
        throw error;
      });
    } else {
      console.log('[FaceAPI] Reutilizando la carga de modelos en curso.');
    }

    await this.cargaModelosPromise;
  }

  obtenerFaceMatcher(): FaceApi.FaceMatcher | null {
    return this.faceMatcher;
  }

  guardarFaceMatcher(faceMatcher: FaceApi.FaceMatcher): void {
    this.faceMatcher = faceMatcher;
  }

  obtenerFaceApi(): Promise<FaceApiModule> {
    if (!this.faceApiPromise) {
      this.faceApiPromise = import('@vladmandic/face-api');
    }
    return this.faceApiPromise;
  }

  registrarDiagnostico(etapa: string): void {
    void this.obtenerFaceApi().then(faceapi => {
      const tf = this.obtenerTensorFlow(faceapi);
      const memoria = tf.memory();
      console.log(`[FaceAPI] Diagnostico (${etapa}):`, {
        backend: tf.getBackend(),
        tensores: memoria.numTensors,
        memoriaMB: Number((memoria.numBytes / 1024 / 1024).toFixed(2)),
        medicionMemoriaInexacta: memoria.unreliable ?? false
      });
    });
  }

  private modelosCargados(faceapi: FaceApiModule): boolean {
    return faceapi.nets.ssdMobilenetv1.isLoaded
      && faceapi.nets.faceLandmark68Net.isLoaded
      && faceapi.nets.faceRecognitionNet.isLoaded;
  }

  private configurarBackend(faceapi: FaceApiModule): Promise<void> {
    if (!this.configuracionBackendPromise) {
      this.configuracionBackendPromise = this.seleccionarBackend(faceapi).catch(error => {
        this.configuracionBackendPromise = null;
        throw error;
      });
    }
    return this.configuracionBackendPromise;
  }

  private async seleccionarBackend(faceapi: FaceApiModule): Promise<void> {
    const tf = this.obtenerTensorFlow(faceapi);
    const inicio = performance.now();

    // Reduce validaciones internas de TensorFlow sin modificar pesos ni precision.
    tf.enableProdMode();

    try {
      // Debe configurarse antes de inicializar el backend WASM.
      tf.setWasmPaths(this.wasmUrl);
      const seleccionado = await tf.setBackend('wasm');
      if (!seleccionado) {
        throw new Error('TensorFlow.js no pudo seleccionar el backend WASM.');
      }
      await tf.ready();
    } catch (error) {
      console.warn(
        '[FaceAPI] WASM no esta disponible; se usara CPU como respaldo:',
        error
      );
      const seleccionado = await tf.setBackend('cpu');
      if (!seleccionado) {
        throw new Error('TensorFlow.js tampoco pudo seleccionar el backend CPU.');
      }
      await tf.ready();
    }

    const backend = tf.getBackend();
    const tiempoMs = Math.round(performance.now() - inicio);
    console.log(`[FaceAPI] Backend TensorFlow listo: ${backend} (${tiempoMs} ms).`);
  }

  private obtenerTensorFlow(faceapi: FaceApiModule): TensorFlowRuntime {
    // El bundle expone toda la API de TensorFlow en runtime, aunque su .d.ts
    // publica un subconjunto mas pequeno.
    return faceapi.tf as unknown as TensorFlowRuntime;
  }

  private async cargarModelosPendientes(faceapi: FaceApiModule): Promise<void> {
    const inicio = performance.now();
    console.log('[FaceAPI] Cargando modelos desde:', this.modelUrl);
    const cargas: Promise<void>[] = [];

    if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
      cargas.push(faceapi.nets.ssdMobilenetv1.loadFromUri(this.modelUrl));
    }
    if (!faceapi.nets.faceLandmark68Net.isLoaded) {
      cargas.push(faceapi.nets.faceLandmark68Net.loadFromUri(this.modelUrl));
    }
    if (!faceapi.nets.faceRecognitionNet.isLoaded) {
      cargas.push(faceapi.nets.faceRecognitionNet.loadFromUri(this.modelUrl));
    }

    await Promise.all(cargas);
    console.log('[FaceAPI] Modelos cargados', {
      tiempoMs: Math.round(performance.now() - inicio)
    });
    this.registrarDiagnostico('modelos cargados');
  }
}
