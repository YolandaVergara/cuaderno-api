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
  // validateRequest(MarkNotificationsReadSchema), // TODO: crear schema si no existe
  (req, res) => controller.markNotificationsAsRead(req as any, res)
);

// GET /api/notifications/unread-count
router.get("/unread-count", (req, res) => controller.getUnreadCount(req, res));

// Endpoint de prueba para confirmar build
router.get("/test", (_req, res) => res.json({ ok: true, route: "notifications/test", timestamp: new Date().toISOString() }));

export default router;
