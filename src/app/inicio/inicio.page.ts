import { Component, OnInit, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import * as faceapi from '@vladmandic/face-api';

@Component({
  selector: 'app-inicio',
  templateUrl: './inicio.page.html',
  styleUrls: ['./inicio.page.scss'],
  standalone: true,
  imports: [CommonModule, IonicModule]
})
export class InicioPage implements OnInit, OnDestroy {
  
  public isLoadingModels = signal<boolean>(true);
  public statusMessage = signal<string>('Cargando redes neuronales...');
  public matchResult = signal<string>('');
  private streamCamara: MediaStream | null = null;
  
  // 1. Creamos la variable para guardar el ID del temporizador
  private intervaloEscaneo: any;

  constructor() {}

  async ngOnInit() {
    await this.encenderCamara();
    await this.cargarModelosIA();
  }

  ngOnDestroy() {
    this.apagarCamara();
    // 2. SÚPER IMPORTANTE: Detener el reloj cuando cierres la app o cambies de pantalla
    if (this.intervaloEscaneo) {
      clearInterval(this.intervaloEscaneo);
    }
  }

  async encenderCamara() {
    try {
      const videoElement = document.getElementById('videoCamara') as HTMLVideoElement;
      this.streamCamara = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' }
      });
      if (videoElement) {
        videoElement.srcObject = this.streamCamara;
      }
    } catch (error) {
      console.error('Error con la cámara:', error);
      this.statusMessage.set('No se pudo acceder a la cámara.');
    }
  }

  async cargarModelosIA() {
    try {
      const MODEL_URL = '../assets/models'; 
      await faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL);
      await faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL);
      await faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL);
      
      this.isLoadingModels.set(false);
      this.statusMessage.set('IA Lista. Búsqueda de rostros iniciada.');
      
      // 3. En cuanto terminan de cargar los "cerebros", arrancamos el ciclo automático
      this.iniciarBucleDeEscaneo();

    } catch (error) {
      console.error('Error cargando IA:', error);
      this.statusMessage.set('Error al cargar los modelos de IA.');
    }
  }

  // 4. Esta es la función que hace el ciclo cada 5000 milisegundos (5 segundos)
  iniciarBucleDeEscaneo() {
    this.intervaloEscaneo = setInterval(() => {
      this.escanearConIA();
    }, 5000);
  }

  async escanearConIA() {
    // Si no hay cámara cargada todavía, que no haga nada para evitar errores
    const videoCamara = document.getElementById('videoCamara') as HTMLVideoElement;
    if (!videoCamara || videoCamara.paused || videoCamara.ended) return;

    this.statusMessage.set('Analizando biometría en vivo...');
    
    const imgGuardada = document.getElementById('imagenReferencia') as HTMLImageElement;

    try {
      const deteccionReferencia = await faceapi
        .detectSingleFace(imgGuardada)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!deteccionReferencia) return;

      const deteccionVivo = await faceapi
        .detectSingleFace(videoCamara)
        .withFaceLandmarks()
        .withFaceDescriptor();

      // Si no detecta a nadie frente al teléfono en ese segundo, limpia el mensaje y se sale
      if (!deteccionVivo) {
        this.statusMessage.set('Esperando sujeto en el marco...');
        this.matchResult.set('');
        return;
      }

      const faceMatcher = new faceapi.FaceMatcher(deteccionReferencia.descriptor, 0.5);
      const coincidencia = faceMatcher.findBestMatch(deteccionVivo.descriptor);

      if (coincidencia.label !== 'unknown') {
        this.matchResult.set('¡ACCESO EXITOSO!');
        this.statusMessage.set('Identidad verificada por Inteligencia Artificial.');
        this.abrirPuertaServomotores();
        
        // OPCIONAL: Si quieres que deje de escanear en cuanto te abre la puerta, descomenta esta línea:
        // clearInterval(this.intervaloEscaneo);

      } else {
        this.matchResult.set('¡ACCESO DENEGADO!');
        this.statusMessage.set('Rostro desconocido (Intruso bloqueado).');
      }

    } catch (error) {
      console.error(error);
    }
  }

  abrirPuertaServomotores() {
    console.log('Señal enviada al backend para accionar cerradura.');
  }

  apagarCamara() {
    if (this.streamCamara) {
      this.streamCamara.getTracks().forEach(track => track.stop());
    }
  }
}