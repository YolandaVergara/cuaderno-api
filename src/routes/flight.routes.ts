import { Router } from 'express';
import { FlightController } from '../controllers/flight.controller';
import { validateRequest } from '../middleware/validation.middleware';
import { authenticateUser } from '../middleware/auth.middleware';
import {
  RegisterFlightTrackingSchema,
  CancelTrackingSchema,
} from '../types/validation';

const router = Router();
const flightController = new FlightController();

// Aplicar autenticación a todas las rutas
router.use(authenticateUser);

/**
 * POST /api/flights/track
 * Registra un vuelo para seguimiento
 */
router.post(
  '/track',
  validateRequest(RegisterFlightTrackingSchema),
  (req: any, res: any) => flightController.registerFlightTracking(req, res)
);

/**
 * GET /api/flights/trackings
 * Obtiene todos los seguimientos activos del usuario
 */
router.get('/trackings', (req: any, res: any) => flightController.getUserFlightTrackings(req, res));

/**
 * DELETE /api/flights/trackings/:trackingId
 * Cancela el seguimiento de un vuelo
 */
router.delete(
  '/trackings/:trackingId',
  validateRequest(CancelTrackingSchema),
  (req: any, res: any) => flightController.cancelFlightTracking(req, res)
);

/**
 * GET /api/flights/:flightId/status
 * Obtiene el estado actual de un vuelo específico
 */
router.get('/:flightId/status', (req: any, res: any) => flightController.getFlightStatus(req, res));

export { router as flightRoutes };
