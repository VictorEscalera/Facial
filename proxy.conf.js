const PROXY_CONFIG = [
  {
    context: ['/api-ngrok'],
    target: 'https://repave-untying-enrage.ngrok-free.dev',
    secure: false,
    changeOrigin: true,
    pathRewrite: {
      '^/api-ngrok': ''
    },
    headers: {
      'ngrok-skip-browser-warning': 'true'
    },
    logLevel: 'debug' // Esto imprimirá en la consola cuando se active el proxy
  }
];

module.exports = PROXY_CONFIG;