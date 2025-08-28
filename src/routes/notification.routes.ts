import { Router } from "express";
import { authenticateUser } from "../middleware/auth.middleware";
import { validateRequest } from "../middleware/validateRequest";
import { GetNotificationsSchema } from "../validation/notifications.schema";
import { NotificationController } from "../controllers/notification.controller";

const router = Router();
const controller = new NotificationController();

// Autenticación para todas las rutas
router.use(authenticateUser);

// GET /api/notifications - CON VALIDACIÓN
router.get(
  "/",
  validateRequest(GetNotificationsSchema),
  (req, res) => controller.getUserNotifications(req as any, res)
);

// PUT /api/notifications/read
router.put(
  "/read", 
  (req, res) => controller.markNotificationsAsRead(req as any, res)
);

// GET /api/notifications/unread-count
router.get("/unread-count", (req, res) => controller.getUnreadCount(req, res));


export { router as notificationRoutes };
