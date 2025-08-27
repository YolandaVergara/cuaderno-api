// Define Notification type locally if not available from another module
export type Notification = {
  id: string;
  userId: string;
  flightTrackingId: string;
  type: string;
  title: string;
  message: string;
  data: any;
  isRead: boolean;
  createdAt: Date;
  // Add other fields as needed based on your Prisma schema
};

// Define NotificationType enum locally if not available from another module
export enum NotificationType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  GATE_CHANGE = 'GATE_CHANGE',
  TERMINAL_CHANGE = 'TERMINAL_CHANGE',
  DELAY_CHANGE = 'DELAY_CHANGE',
  FLIGHT_CANCELLED = 'FLIGHT_CANCELLED',
}
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { FlightChange, NotificationData } from '../types/flight';

export class NotificationService {
  /**
   * Crea notificaciones para cambios detectados en un vuelo
   */
  async createNotificationsForChanges(
    userId: string,
    flightTrackingId: string,
    changes: FlightChange[]
  ): Promise<Notification[]> {
    try {
      const notifications = [];

      for (const change of changes) {
        const notification = await this.createNotification(userId, flightTrackingId, change);
        notifications.push(notification);
      }

      logger.info('Notifications created for flight changes', {
        userId,
        flightTrackingId,
        notificationCount: notifications.length,
      });

      return notifications;
    } catch (error) {
      logger.error('Error creating notifications for changes', {
        userId,
        flightTrackingId,
        changes,
        error,
      });
      throw error;
    }
  }

  /**
   * Crea una notificación individual
   */
  private async createNotification(
    userId: string,
    flightTrackingId: string,
    change: FlightChange
  ): Promise<Notification> {
    const { title, message } = this.generateNotificationContent(change);

    return await prisma.notification.create({
      data: {
        userId,
        flightTrackingId,
        type: change.type,
        title,
        message,
        data: {
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          significance: change.significance,
        },
      },
    });
  }

  /**
   * Genera el contenido de la notificación basado en el tipo de cambio
   */
  private generateNotificationContent(change: FlightChange): { title: string; message: string } {
    switch (change.type) {
      case NotificationType.STATUS_CHANGE:
        return {
          title: 'Estado del vuelo actualizado',
          message: `El estado de tu vuelo cambió de ${change.oldValue} a ${change.newValue}`,
        };

      case NotificationType.GATE_CHANGE:
        return {
          title: 'Cambio de puerta',
          message: `La puerta de embarque cambió de ${change.oldValue || 'sin asignar'} a ${change.newValue || 'sin asignar'}`,
        };

      case NotificationType.TERMINAL_CHANGE:
        return {
          title: 'Cambio de terminal',
          message: `La terminal cambió de ${change.oldValue || 'sin asignar'} a ${change.newValue || 'sin asignar'}`,
        };

      case NotificationType.DELAY_CHANGE:
        const oldDelay = change.oldValue as number;
        const newDelay = change.newValue as number;
        const delayDiff = newDelay - oldDelay;
        
        if (delayDiff > 0) {
          return {
            title: 'Retraso en el vuelo',
            message: `Tu vuelo tiene un retraso adicional de ${delayDiff} minutos (total: ${newDelay} minutos)`,
          };
        } else {
          return {
            title: 'Mejora en el horario',
            message: `El retraso de tu vuelo se redujo en ${Math.abs(delayDiff)} minutos (total: ${newDelay} minutos)`,
          };
        }

      case NotificationType.FLIGHT_CANCELLED:
        return {
          title: 'Vuelo cancelado',
          message: 'Tu vuelo ha sido cancelado. Contacta a la aerolínea para más información.',
        };

      default:
        return {
          title: 'Actualización del vuelo',
          message: `Cambio detectado en ${change.field}: de ${change.oldValue} a ${change.newValue}`,
        };
    }
  }

  /**
   * Obtiene las notificaciones de un usuario con paginación
   */
  async getUserNotifications(
    userId: string,
    page = 1,
    limit = 20,
    unreadOnly = false
  ): Promise<{
    notifications: (Notification & { flightTracking: any })[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    try {
      const skip = (page - 1) * limit;
      const where = {
        userId,
        ...(unreadOnly && { isRead: false }),
      };

      const [notifications, total] = await Promise.all([
        prisma.notification.findMany({
          where,
          include: {
            flightTracking: {
              select: {
                flightId: true,
                flightNumber: true,
                airline: true,
                origin: true,
                destination: true,
                scheduledDeparture: true,
              },
            },
          },
          orderBy: {
            createdAt: 'desc',
          },
          skip,
          take: limit,
        }),
        prisma.notification.count({ where }),
      ]);

      const totalPages = Math.ceil(total / limit);

      return {
        notifications,
        total,
        page,
        totalPages,
      };
    } catch (error) {
      logger.error('Error getting user notifications', { userId, page, limit, unreadOnly, error });
      throw error;
    }
  }

  /**
   * Marca notificaciones como leídas
   */
  async markNotificationsAsRead(userId: string, notificationIds: string[]): Promise<number> {
    try {
      const result = await prisma.notification.updateMany({
        where: {
          id: { in: notificationIds },
          userId,
          isRead: false,
        },
        data: {
          isRead: true,
        },
      });

      logger.info('Notifications marked as read', {
        userId,
        notificationIds,
        updatedCount: result.count,
      });

      return result.count;
    } catch (error) {
      logger.error('Error marking notifications as read', { userId, notificationIds, error });
      throw error;
    }
  }

  /**
   * Obtiene el conteo de notificaciones no leídas
   */
  async getUnreadNotificationCount(userId: string): Promise<number> {
    try {
      return await prisma.notification.count({
        where: {
          userId,
          isRead: false,
        },
      });
    } catch (error) {
      logger.error('Error getting unread notification count', { userId, error });
      throw error;
    }
  }

  /**
   * Elimina notificaciones antiguas (cleanup job)
   */
  async cleanupOldNotifications(olderThanDays = 30): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const result = await prisma.notification.deleteMany({
        where: {
          createdAt: {
            lt: cutoffDate,
          },
          isRead: true,
        },
      });

      logger.info('Old notifications cleaned up', {
        deletedCount: result.count,
        cutoffDate,
      });

      return result.count;
    } catch (error) {
      logger.error('Error cleaning up old notifications', { olderThanDays, error });
      throw error;
    }
  }
}
