import { Router } from 'express';
import { NotificationController } from '../controllers/notification.controller';
import { validateRequest } from '../middleware/validation.middleware';
import { authenticateUser } from '../middleware/auth.middleware';
import {
  GetNotificationsSchema,
  MarkNotificationsReadSchema,
} from '../types/validation';

const router = Router();
const notificationController = new NotificationController();

// Aplicar autenticación a todas las rutas
router.use(authenticateUser);

/**
 * GET /api/notifications
 * Obtiene las notificaciones del usuario con paginación
 */
router.get(
  '/',
  validateRequest(GetNotificationsSchema),
  (req: any, res: any) => notificationController.getUserNotifications(req, res)
);

/**
 * PUT /api/notifications/read
 * Marca notificaciones como leídas
 */
router.put(
  '/read',
  validateRequest(MarkNotificationsReadSchema),
  (req: any, res: any) => notificationController.markNotificationsAsRead(req, res)
);

/**
 * GET /api/notifications/unread-count
 * Obtiene el conteo de notificaciones no leídas
 */
router.get('/unread-count', (req: any, res: any) => notificationController.getUnreadCount(req, res));

export { router as notificationRoutes };
