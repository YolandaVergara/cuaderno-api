import { Router } from 'express';
import { flightRoutes } from './flight.routes';
import { notificationRoutes } from './notification.routes';

const router = Router();

// Rutas de la API
router.use('/flight', flightRoutes);  // Cambiado a singular como especifica el requirement
router.use('/notifications', notificationRoutes);

export { router as apiRoutes };
