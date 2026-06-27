/**
 * app.js
 * Configuración de la aplicación Express: middlewares globales, rutas y manejo de errores.
 */
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');

const corsOptions = require('./config/cors');
const routes = require('./routes/index.routes');
const requestLogger = require('./middlewares/request-logger.middleware');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();

// ID y trazas de cada petición, incluso cuando otro middleware la rechaza.
app.use(requestLogger);

// Seguridad de cabeceras HTTP
app.use(helmet());

// CORS
app.use(cors(corsOptions));

// Parseo de body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rutas de la API (montadas bajo /api)
app.use('/api', routes);

// Ruta raíz informativa
app.get('/', (req, res) => {
  res.json({
    ok: true,
    message: 'API app_transporte. Use el prefijo /api para acceder a los recursos.',
  });
});

// Manejo de 404 y errores (siempre al final)
app.use(notFoundHandler);
app.use(errorHandler);

module.exports = app;
