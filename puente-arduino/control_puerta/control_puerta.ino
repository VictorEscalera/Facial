#include <Arduino.h>
#include <Servo.h>

Servo servoCerradura;
Servo servoPuerta1;
Servo servoPuerta2;

const uint8_t pinCerradura = 9;
const uint8_t pinPuerta1 = 10;
const uint8_t pinPuerta2 = 11;

// Ajusta estos ángulos después de probar el mecanismo sin carga.
const int cerraduraTrabada = 0;
const int cerraduraDestrabada = 90;
const int puertaCerrada = 0;
const int puertaAbierta = 180;

// Actívalo si el segundo servo está montado como espejo.
const bool puerta2Invertida = false;

const unsigned long pausaPestilloMs = 500;
const unsigned long tiempoPuertaAbiertaMs = 5000;
const unsigned long intervaloPasoServoMs = 15;

enum EstadoAcceso {
  REPOSO,
  ESPERANDO_DESTRABADO,
  ABRIENDO,
  ESPERANDO_CIERRE,
  CERRANDO,
  ESPERANDO_TRABADO
};

EstadoAcceso estado = REPOSO;
unsigned long inicioEstadoMs = 0;
unsigned long ultimoPasoMs = 0;
int posicionPuerta = puertaCerrada;

// Prototipos explicitos para Arduino IDE y el analizador C++ de VS Code.
void leerComandosSeriales();
void iniciarAcceso();
void actualizarSecuenciaAcceso();
void moverPuertas(int posicion);

void setup() {
  Serial.begin(9600);

  // Guardar las posiciones antes de generar pulsos reduce movimientos bruscos.
  servoCerradura.write(cerraduraTrabada);
  moverPuertas(puertaCerrada);

  servoCerradura.attach(pinCerradura);
  servoPuerta1.attach(pinPuerta1);
  servoPuerta2.attach(pinPuerta2);

  delay(500);
  Serial.println("LISTO");
}

void loop() {
  leerComandosSeriales();
  actualizarSecuenciaAcceso();
}

void leerComandosSeriales() {
  while (Serial.available() > 0) {
    const char comando = Serial.read();

    if (comando == '\n' || comando == '\r' || comando == ' ') {
      continue;
    }

    if (comando == 'A' || comando == 'a') {
      if (estado == REPOSO) {
        iniciarAcceso();
      } else {
        Serial.println("OCUPADO");
      }
    } else {
      Serial.print("COMANDO_INVALIDO:");
      Serial.println(comando);
    }
  }
}

void iniciarAcceso() {
  Serial.println("ACCESO_INICIADO");
  servoCerradura.write(cerraduraDestrabada);
  inicioEstadoMs = millis();
  estado = ESPERANDO_DESTRABADO;
}

void actualizarSecuenciaAcceso() {
  const unsigned long ahora = millis();

  switch (estado) {
    case REPOSO:
      break;

    case ESPERANDO_DESTRABADO:
      if (ahora - inicioEstadoMs >= pausaPestilloMs) {
        posicionPuerta = puertaCerrada;
        ultimoPasoMs = ahora;
        estado = ABRIENDO;
      }
      break;

    case ABRIENDO:
      if (ahora - ultimoPasoMs >= intervaloPasoServoMs) {
        ultimoPasoMs = ahora;
        if (posicionPuerta < puertaAbierta) {
          posicionPuerta++;
          moverPuertas(posicionPuerta);
        } else {
          Serial.println("PUERTA_ABIERTA");
          inicioEstadoMs = ahora;
          estado = ESPERANDO_CIERRE;
        }
      }
      break;

    case ESPERANDO_CIERRE:
      if (ahora - inicioEstadoMs >= tiempoPuertaAbiertaMs) {
        ultimoPasoMs = ahora;
        estado = CERRANDO;
      }
      break;

    case CERRANDO:
      if (ahora - ultimoPasoMs >= intervaloPasoServoMs) {
        ultimoPasoMs = ahora;
        if (posicionPuerta > puertaCerrada) {
          posicionPuerta--;
          moverPuertas(posicionPuerta);
        } else {
          inicioEstadoMs = ahora;
          estado = ESPERANDO_TRABADO;
        }
      }
      break;

    case ESPERANDO_TRABADO:
      if (ahora - inicioEstadoMs >= pausaPestilloMs) {
        servoCerradura.write(cerraduraTrabada);
        estado = REPOSO;
        Serial.println("LISTO");
      }
      break;
  }
}

void moverPuertas(int posicion) {
  servoPuerta1.write(posicion);

  const int posicionServo2 = puerta2Invertida
    ? puertaAbierta + puertaCerrada - posicion
    : posicion;
  servoPuerta2.write(posicionServo2);
}
