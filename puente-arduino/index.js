const express = require('express');
const cors = require('cors');
const { SerialPort } = require('serialport');

const app = express();

// Permitimos que tu App de Ionic se comunique con este servidor
app.use(cors());
app.use(express.json());

// ⚠️ IMPORTANTE: Cambia 'COM3' por el puerto donde esté tu Arduino físico
const puertoArduino = 'COM3'; 
const baudios = 9600; // La velocidad definida en tu void setup()

let arduino;

try {
    // Abrimos el conducto de comunicación física con el Arduino
    arduino = new SerialPort({ path: puertoArduino, baudRate: baudios });

    arduino.on('open', () => {
        console.log(`🤖 [Hardware] Conectado exitosamente al Arduino en el puerto ${puertoArduino}`);
    });

    arduino.on('error', (err) => {
        console.log('⚠️ Error en el puerto Serial. ¿El Arduino está conectado?: ', err.message);
    });

} catch (error) {
    console.error("No se pudo iniciar el puerto serial.");
}

// Creamos la ruta de disparo
app.post('/abrir-puerta', (req, res) => {
    if (arduino && arduino.isOpen) {
        // Tu Arduino está programado para recibir una 'A' y mover los servomotores a 90 grados
        arduino.write('A', (err) => {
            if (err) {
                console.log('Error enviando señal electromagnética:', err.message);
                return res.status(500).json({ status: 'error', message: 'Fallo al enviar señal' });
            }
            console.log('⚡ [Hardware] ¡Señal de apertura (A) enviada a los 3 servomotores SG90!');
            res.json({ status: 'success', message: 'Puerta abierta' });
        });
    } else {
        res.status(503).json({ status: 'error', message: 'Arduino desconectado de la PC' });
    }
});

// Arrancamos el servidor local
const PORT = 5000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [Puente Red] Escuchando órdenes en http://localhost:${PORT}`);
});