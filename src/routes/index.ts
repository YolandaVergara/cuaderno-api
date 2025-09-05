import { Router } from 'express';
import { flightRoutes } from './flight.routes';
import { notificationRoutes } from './notification.routes';
import pushRoutes from './push.routes';
import debugRoutes from './debug.routes';
import { flightAwareRoutes } from './flightaware.routes';

const router = Router();

// Rutas de la API
router.use('/flight', flightRoutes);  // Cambiado a singular como especifica el requirement
router.use('/notifications', notificationRoutes);
router.use('/push', pushRoutes);

// FlightAware proxy routes (for frontend compatibility)
router.use('/', flightAwareRoutes);

// Rutas de debug (temporalmente habilitadas en producción para migración)
router.use('/debug', debugRoutes);

export { router as apiRoutes };
