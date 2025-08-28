import { Router } from 'express';
import { flightRoutes } from './flight.routes';
import { notificationRoutes } from './notification.routes';
import pushRoutes from './push.routes';

const router = Router();

// Rutas de la API
router.use('/flight', flightRoutes);  // Cambiado a singular como especifica el requirement
router.use('/notifications', notificationRoutes);
router.use('/push', pushRoutes);

export { router as apiRoutes };
