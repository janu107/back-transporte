/**
 * app.js
 * Configuración de la aplicación Express: middlewares globales, rutas y manejo de errores.
 */
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');

const corsOptions = require('./config/cors');
const routes = require('./routes/index.routes');
const { notFoundHandler, errorHandler } = require('./middlewares/error.middleware');

const app = express();

// Seguridad de cabeceras HTTP
app.use(helmet());

// CORS
app.use(cors(corsOptions));

// Logger de peticiones
app.use(morgan('dev'));

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
