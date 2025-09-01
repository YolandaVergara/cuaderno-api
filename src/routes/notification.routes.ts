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

// GET /api/notifications/trips - Notificaciones por trips
router.get("/trips", (req, res) => controller.getNotificationsByTrips(req, res));

// SSE stream endpoint (no auth middleware needed here as it handles auth internally)
router.get("/stream", (req, res, next) => {
  // Remove auth middleware for SSE endpoint as it handles userId via query param
  req.url = req.originalUrl;
  next();
});

// POST /api/notifications/test - Test endpoint (development only)
if (process.env.NODE_ENV !== 'production') {
  router.post("/test", async (req, res) => {
    try {
      const { NotificationService } = await import("../services/notification.service");
      const notificationService = new NotificationService();
      
      const userId = (req as any).userId || req.headers["x-user-id"] as string;
      if (!userId) {
        return res.status(400).json({ error: "x-user-id header required" });
      }

      // Create test upcoming flight notification
      const testFlightTracking = {
        id: `test-tracking-${Date.now()}`,
        flightId: `TEST${Math.floor(Math.random() * 1000)}`,
        flightNumber: 'TE123',
        airline: 'TEST Airlines',
        origin: 'MAD',
        destination: 'BCN',
        scheduledDeparture: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours from now
        status: 'SCHEDULED',
        gate: 'B12',
        terminal: 'T1',
        delay: 0
      };

      const upcoming = await notificationService.createUpcomingFlightNotification(userId, testFlightTracking);

      // Create test flight update notifications
      const oldData = { status: 'SCHEDULED', gate: 'B12', terminal: 'T1', delay: 0 };
      const newData = { status: 'BOARDING', gate: 'B15', terminal: 'T1', delay: 15 };
      
      const updates = await notificationService.createFlightUpdateNotifications(
        userId, 
        testFlightTracking.id, 
        oldData, 
        newData
      );

      res.json({
        message: "Test notifications created",
        upcoming,
        updates: updates.length,
        testFlight: testFlightTracking
      });
    } catch (error) {
      console.error("Test notification error:", error);
      res.status(500).json({ 
        error: "Failed to create test notifications",
        details: (error as Error).message 
      });
    }
  });
}

export { router as notificationRoutes };
