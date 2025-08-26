import { Router } from 'express';
import { flightRoutes } from './flight.routes';
import { notificationRoutes } from './notification.routes';

const router = Router();

// Rutas de la API
router.use('/flights', flightRoutes);
router.use('/notifications', notificationRoutes);

// Ruta de health check
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'cuaderno-api',
  });
});

export { router as apiRoutes };
