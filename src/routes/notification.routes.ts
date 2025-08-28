import { Router, Request, Response } from 'express';
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
  (req: Request, res: Response) => {
    notificationController.getUserNotifications(req as any, res);
  }
);

/**
 * PUT /api/notifications/read
 * Marca notificaciones como leídas
 */
router.put(
  '/read',
  validateRequest(MarkNotificationsReadSchema),
  (req: Request, res: Response) => {
    notificationController.markNotificationsAsRead(req as any, res);
  }
);

/**
 * GET /api/notifications/unread-count
 * Obtiene el conteo de notificaciones no leídas
 */
router.get('/unread-count', (req: Request, res: Response) => {
  notificationController.getUnreadCount(req, res);
});

export { router as notificationRoutes };
