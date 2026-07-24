const express = require('express');
const cors = require('cors');
const { SerialPort, ReadlineParser } = require('serialport');

const app = express();
const PORT = Number(process.env.PORT || 5000);
const puertoArduino = process.env.ARDUINO_PORT || 'COM3';
const baudios = 9600;
const tiempoMaximoOperacionMs = 20000;

const origenesPermitidos = new Set([
    'http://localhost:4200',
    'http://localhost:8100',
    'https://localhost',
    'capacitor://localhost',
]);

for (const origen of (process.env.ALLOWED_ORIGINS || '').split(',')) {
    if (origen.trim()) origenesPermitidos.add(origen.trim());
}

app.use(cors({
    origin(origen, callback) {
        if (!origen || origenesPermitidos.has(origen)) {
            callback(null, true);
            return;
        }
        callback(new Error(`Origen no permitido por CORS: ${origen}`));
    },
}));
app.use(express.json());

let arduino;
let hardwareOcupado = false;
let arduinoListo = false;
let respuestaPendiente = null;
let temporizadorOperacion = null;

function limpiarTemporizador() {
    if (temporizadorOperacion) {
        clearTimeout(temporizadorOperacion);
        temporizadorOperacion = null;
    }
}

function responderOperacion(codigo, contenido) {
    const respuesta = respuestaPendiente;
    respuestaPendiente = null;
    limpiarTemporizador();

    if (respuesta && !respuesta.headersSent && !respuesta.writableEnded && !respuesta.destroyed) {
        respuesta.status(codigo).json(contenido);
    }
}

function fallarOperacion(mensaje, codigo = 503) {
    hardwareOcupado = false;
    arduinoListo = false;
    responderOperacion(codigo, { status: 'error', message: mensaje });
}

function procesarMensajeArduino(mensajeOriginal) {
    const mensaje = mensajeOriginal.trim();
    if (!mensaje) return;

    console.log(`🤖 [Arduino] ${mensaje}`);

    switch (mensaje) {
        case 'ACCESO_INICIADO':
            hardwareOcupado = true;
            arduinoListo = false;
            break;
        case 'PUERTA_ABIERTA':
            console.log('🔓 [Hardware] Puerta abierta; esperando cierre automático.');
            break;
        case 'OCUPADO':
            hardwareOcupado = true;
            arduinoListo = false;
            responderOperacion(409, {
                status: 'busy',
                message: 'Arduino ya está ejecutando una secuencia de acceso',
            });
            break;
        case 'LISTO':
            hardwareOcupado = false;
            arduinoListo = true;
            responderOperacion(200, {
                status: 'success',
                message: 'Secuencia completada: puerta cerrada y pestillo trabado',
            });
            break;
        default:
            if (mensaje.startsWith('COMANDO_INVALIDO:')) {
                fallarOperacion(mensaje, 500);
            }
            break;
    }
}

try {
    arduino = new SerialPort({ path: puertoArduino, baudRate: baudios });
    const parser = arduino.pipe(new ReadlineParser({ delimiter: '\n' }));

    arduino.on('open', () => {
        arduinoListo = false;
        console.log(`🤖 [Hardware] Conectado al Arduino en ${puertoArduino} a ${baudios} baudios.`);
    });
    parser.on('data', procesarMensajeArduino);
    arduino.on('error', (error) => {
        console.error('⚠️ Error en el puerto serial:', error.message);
        fallarOperacion(`Error serial: ${error.message}`);
    });
    arduino.on('close', () => {
        arduinoListo = false;
        console.error('⚠️ Se cerró la conexión con Arduino.');
        fallarOperacion('Arduino desconectado de la PC');
    });
} catch (error) {
    console.error('No se pudo iniciar el puerto serial:', error.message);
}

app.get('/estado-puerta', (req, res) => {
    res.json({
        conectado: Boolean(arduino && arduino.isOpen),
        ocupado: hardwareOcupado,
        listo: arduinoListo,
    });
});

app.post('/abrir-puerta', (req, res) => {
    if (!arduino || !arduino.isOpen) {
        res.status(503).json({ status: 'error', message: 'Arduino desconectado de la PC' });
        return;
    }

    if (!arduinoListo) {
        res.status(503).json({
            status: 'error',
            message: 'Arduino conectado, pero todavía no confirmó LISTO',
        });
        return;
    }

    if (hardwareOcupado || respuestaPendiente) {
        res.status(409).json({
            status: 'busy',
            message: 'La puerta ya está ejecutando una secuencia de acceso',
        });
        return;
    }

    hardwareOcupado = true;
    arduinoListo = false;
    respuestaPendiente = res;
    temporizadorOperacion = setTimeout(() => {
        fallarOperacion('Arduino no confirmó el fin de la secuencia', 504);
    }, tiempoMaximoOperacionMs);

    arduino.write('A', (error) => {
        if (error) {
            console.error('Error enviando la orden A:', error.message);
            fallarOperacion('Fallo al enviar la orden al Arduino', 500);
            return;
        }
        console.log('⚡ [Hardware] Orden A enviada; esperando confirmación LISTO.');
    });
});

app.use((error, req, res, next) => {
    if (res.headersSent) {
        next(error);
        return;
    }
    res.status(403).json({ status: 'error', message: error.message });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [Puente Red] Escuchando órdenes en http://localhost:${PORT}`);
});
