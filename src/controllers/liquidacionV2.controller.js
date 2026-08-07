/** Controlador HTTP del módulo de liquidaciones v2. */
const service = require('../services/liquidacionV2.service');
const { success, error } = require('../utils/response');

const userOf = (req) => req.user?.usuario || 'sistema';

async function responder(res, next, work, message = 'OK', status = 200) {
  try {
    return success(res, await work(), message, status);
  } catch (err) {
    if (err.status) return error(res, err.message, err.status);
    return next(err);
  }
}

module.exports = {
  polizasDisponibles: (req, res, next) => responder(
    res, next, () => service.polizasDisponibles()
  ),
  vistaPrevia: (req, res, next) => responder(
    res, next, () => service.vistaPrevia(req.params.id_poliza)
  ),
  generar: (req, res, next) => responder(
    res,
    next,
    () => service.generar(
      req.body.id_poliza, req.body.id_liq_origen, userOf(req), req.body.aplica_sobregiro
    ),
    'Liquidación generada correctamente',
    201
  ),
  detalle: (req, res, next) => responder(
    res, next, () => service.detalleLiquidacion(req.params.id_liquidacion)
  ),
  historial: (req, res, next) => responder(
    res, next, () => service.historial(req.query)
  ),
  reversibles: (req, res, next) => responder(
    res, next, () => service.reversibles(req.query.buscar)
  ),
  revertir: (req, res, next) => responder(
    res,
    next,
    () => service.revertir(req.params.id_liquidacion, userOf(req), req.body.motivo),
    'Liquidación revertida correctamente'
  ),
  sobregiros: (req, res, next) => responder(
    res, next, () => service.sobregiros()
  ),
  abonos: (req, res, next) => responder(
    res, next, () => service.abonos(req.params.id_transportista)
  ),
  registrarAbono: (req, res, next) => responder(
    res,
    next,
    () => service.registrarAbono(req.body, userOf(req)),
    'Abono registrado correctamente',
    201
  ),
  reporte: (req, res, next) => responder(
    res, next, () => service.reporte(req.query)
  ),
  reporteDetallado: (req, res, next) => responder(
    res, next, () => service.reporteDetallado(req.params.id_liquidacion)
  ),
  resumenTransportista: (req, res, next) => responder(
    res, next, () => service.resumenPorTransportista(req.query)
  ),
};
