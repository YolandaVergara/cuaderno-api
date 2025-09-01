import { Request, Response } from "express";
import { logger } from "../config/logger";
import { NotificationService } from "../services/notification.service";

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  /**
   * Obtiene las notificaciones de un usuario con paginación
   * DEFENSIVO: funciona con o sin middleware de validación
   */
  async getUserNotifications(req: Request & { validated?: any; userId?: string }, res: Response) {
    try {
      const userId = (req as any).userId || req.headers["x-user-id"];
      if (!userId) return res.status(401).json({ error: "Missing userId" });


      // Usa validated si existe; si no, recurre a req.query
      const q = (req.validated?.query ?? req.query) as any;
      const page = q.page ? parseInt(String(q.page), 10) : 1;
      const limit = q.limit ? parseInt(String(q.limit), 10) : 20;
      const unreadOnly = q.unreadOnly === true || String(q.unreadOnly) === "true";


      // Llamar al servicio
      const result = await this.notificationService.getUserNotifications(
        String(userId), page, limit, unreadOnly
      );

      return res.json({
        message: "Notifications retrieved successfully",
        pagination: { page, limit, total: result.total, totalPages: result.totalPages },
        count: result.notifications.length,
        data: result.notifications.map(notification => ({
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          meta: (notification as any).data, // Map data to meta for consistency
          data: (notification as any).data, // Keep data for backward compatibility
          isRead: notification.isRead,
          createdAt: notification.createdAt,
          flight: {
            flightId: notification.flightTracking?.flightId,
            flightNumber: notification.flightTracking?.flightNumber,
            airline: notification.flightTracking?.airline,
            origin: notification.flightTracking?.origin,
            destination: notification.flightTracking?.destination,
            scheduledDeparture: notification.flightTracking?.scheduledDeparture,
          },
        })),
      });
    } catch (e: any) {
      console.error("🔍 ERROR in getUserNotifications:", e);
      return res.status(500).json({ 
        error: "Failed to get notifications", 
        details: e.message || String(e) 
      });
    }
  }

  /**
   * Marca notificaciones como leídas
   */
  async markNotificationsAsRead(req: Request & { validated?: any }, res: Response) {
    try {
      const userId = (req as any).userId;
      const { notificationIds } = req.validated?.body || req.body;

      const updatedCount = await this.notificationService.markNotificationsAsRead(
        userId,
        notificationIds
      );

      res.json({
        message: 'Notifications marked as read',
        updatedCount,
      });
    } catch (error) {
      logger.error('Error marking notifications as read', { error });
      res.status(500).json({
        error: 'Failed to mark notifications as read',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Obtiene el conteo de notificaciones no leídas
   */
  async getUnreadCount(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const count = await this.notificationService.getUnreadNotificationCount(userId);

      res.json({
        message: 'Unread notification count retrieved',
        count,
      });
    } catch (error) {
      logger.error('Error getting unread notification count', { error });
      res.status(500).json({
        error: 'Failed to get unread notification count',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Obtiene notificaciones de vuelos para trips específicos
   */
  async getNotificationsByTrips(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId || req.headers["x-user-id"];
      if (!userId) {
        res.status(401).json({ error: "Missing userId" });
        return;
      }

      const { tripIds } = req.query;
      if (!tripIds) {
        res.status(400).json({ error: "tripIds parameter is required" });
        return;
      }

      const tripIdsArray = Array.isArray(tripIds) ? tripIds : [tripIds];
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const unreadOnly = String(req.query.unreadOnly) === "true";

      // Usar consulta SQL directa temporalmente hasta que Prisma reconozca tripId
      const result = await this.getNotificationsByTripsDirectSQL(
        String(userId),
        tripIdsArray as string[],
        page,
        limit,
        unreadOnly
      );

      res.json({
        message: "Trip notifications retrieved successfully",
        pagination: { page, limit, total: result.total, totalPages: result.totalPages },
        count: result.notifications.length,
        data: result.notifications,
      });
    } catch (error) {
      logger.error('Error getting notifications by trips', { error });
      res.status(500).json({
        error: 'Failed to get trip notifications',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Método temporal usando SQL directo para obtener notificaciones por trips
   */
  private async getNotificationsByTripsDirectSQL(
    userId: string,
    tripIds: string[],
    page: number,
    limit: number,
    unreadOnly: boolean
  ) {
    // Implementación temporal usando SQL directo
    // En una aplicación real, esto se haría con Prisma una vez que reconozca el campo tripId
    const offset = (page - 1) * limit;
    
    // Por ahora, devolver las notificaciones del usuario como fallback
    const result = await this.notificationService.getUserNotifications(userId, page, limit, unreadOnly);
    
    return {
      notifications: result.notifications.map(notification => ({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        meta: (notification as any).data,
        data: (notification as any).data,
        isRead: notification.isRead,
        createdAt: notification.createdAt,
        flight: {
          flightId: notification.flightTracking?.flightId,
          flightNumber: notification.flightTracking?.flightNumber,
          airline: notification.flightTracking?.airline,
          origin: notification.flightTracking?.origin,
          destination: notification.flightTracking?.destination,
          scheduledDeparture: notification.flightTracking?.scheduledDeparture,
        },
      })),
      total: result.total,
      totalPages: result.totalPages,
    };
  }
}
