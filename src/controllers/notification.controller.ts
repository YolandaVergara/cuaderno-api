import { Request, Response } from 'express';
import { ValidatedRequest } from '../middleware/validation.middleware';
import { GetNotificationsInput, MarkNotificationsReadInput } from '../types/validation';
import { NotificationService } from '../services/notification.service';
import { logger } from '../config/logger';

export class NotificationController {
  private notificationService: NotificationService;

  constructor() {
    this.notificationService = new NotificationService();
  }

  /**
   * Obtiene las notificaciones de un usuario con paginación
   */
  async getUserNotifications(
    req: ValidatedRequest<GetNotificationsInput>,
    res: Response
  ): Promise<void> {
    try {
      console.log("DEBUG: req object:", Object.keys(req || {}));
      console.log("DEBUG: req.query:", req.query);
      
      const userId = (req as any).userId;
      console.log("DEBUG: userId:", userId);
      
      if (!userId) {
        throw new Error("User ID not found in request");
      }
      
      const queryData = req.query || {};
      const page = queryData.page ? parseInt(queryData.page as string, 10) : 1;
      const limit = queryData.limit ? parseInt(queryData.limit as string, 10) : 20;
      const unreadOnly = queryData.unreadOnly === 'true' || queryData.unreadOnly === '1';

      const result = await this.notificationService.getUserNotifications(
        userId,
        page,
        limit,
        unreadOnly
      );

      res.json({
        message: 'Notifications retrieved successfully',
        data: result.notifications.map(notification => ({
          id: notification.id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          isRead: notification.isRead,
          createdAt: notification.createdAt,
          flight: {
            flightId: notification.flightTracking.flightId,
            flightNumber: notification.flightTracking.flightNumber,
            airline: notification.flightTracking.airline,
            origin: notification.flightTracking.origin,
            destination: notification.flightTracking.destination,
            scheduledDeparture: notification.flightTracking.scheduledDeparture,
          },
        })),
        pagination: {
          page: result.page,
          limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      });
    } catch (error) {
      logger.error('Error getting user notifications', { error });
      res.status(500).json({
        error: 'Failed to get notifications',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Marca notificaciones como leídas
   */
  async markNotificationsAsRead(
    req: ValidatedRequest<MarkNotificationsReadInput>,
    res: Response
  ): Promise<void> {
    try {
      console.log("DEBUG: req object:", Object.keys(req || {}));
      const userId = (req as any).userId;
      console.log("DEBUG: userId:", userId);
      const { notificationIds } = req.validated.body;

      const updatedCount = await this.notificationService.markNotificationsAsRead(
        userId,
        notificationIds
      );

      res.json({
        message: 'Notifications marked as read',
        updatedCount,
        notificationIds,
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
      console.log("DEBUG: req object:", Object.keys(req || {}));
      const userId = (req as any).userId;
      console.log("DEBUG: userId:", userId);
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
}
