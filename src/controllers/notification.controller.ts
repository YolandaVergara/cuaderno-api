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
      async getUserNotifications(req: any, res: any): Promise<void> {
    try {
      console.log("🔍 DEBUG: Method called");
      console.log("🔍 DEBUG: req exists:", !!req);
      console.log("🔍 DEBUG: req.query exists:", !!req?.query);
      
      res.json({
        message: 'Debug: Method working',
        requestExists: !!req,
        queryExists: !!req?.query,
        keys: req ? Object.keys(req) : 'req is null'
      });
    } catch (error) {
      console.error("🔍 DEBUG: Error in method:", error);
      res.status(500).json({
        error: 'Debug error',
        details: error.message
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
