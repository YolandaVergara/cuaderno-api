import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { FlightChange, NotificationData, NotificationType } from '../types/flight';
import { createPushService } from './push.service';
import { connection } from '../infra/redis';
import { Notification } from '@prisma/client';

export class NotificationService {
  private pushService = createPushService(prisma);

  /**
   * Crea notificación "UPCOMING_FLIGHT" de forma idempotente cuando faltan ≤6h
   * Note: Using STATUS_CHANGE as fallback until schema migration
   */
  async createUpcomingFlightNotification(
    userId: string,
    flightTracking: { 
      id: string; 
      flightId: string;
      flightNumber: string;
      airline: string;
      origin: string; 
      destination: string;
      scheduledDeparture: Date;
      status: string;
      gate?: string;
      terminal?: string;
      delay: number;
    }
  ): Promise<Notification | null> {
    try {
      // Verificar si ya existe (idempotencia) - buscar por título específico
      const existing = await prisma.notification.findFirst({
        where: {
          userId,
          flightTrackingId: flightTracking.id,
          title: '✈️ Próximo vuelo'
        }
      });

      if (existing) {
        logger.info('UPCOMING_FLIGHT notification already exists', { 
          userId, 
          flightTrackingId: flightTracking.id 
        });
        return existing; // Return as-is, the notification already exists
      }

      // Crear la notificación
      const hoursUntil = Math.round((flightTracking.scheduledDeparture.getTime() - Date.now()) / (1000 * 60 * 60));
      
      const notification = await prisma.notification.create({
        data: {
          userId,
          flightTrackingId: flightTracking.id,
          type: NotificationType.STATUS_CHANGE,
          title: '✈️ Próximo vuelo',
          message: `Tu vuelo ${flightTracking.flightNumber} sale en ${hoursUntil}h (${flightTracking.origin} → ${flightTracking.destination})`,
          data: JSON.stringify({
            flightId: flightTracking.flightId,
            flightNumber: flightTracking.flightNumber,
            airline: flightTracking.airline,
            origin: flightTracking.origin,
            destination: flightTracking.destination,
            scheduledDeparture: flightTracking.scheduledDeparture.toISOString(),
            status: flightTracking.status,
            gate: flightTracking.gate,
            terminal: flightTracking.terminal,
            delay: flightTracking.delay,
            hoursUntil,
            notificationType: 'UPCOMING_FLIGHT'
          })
        }
      });

      const mappedNotification: Notification = notification;

      // Publicar por SSE (no esperar)
      this.publishNotificationToSSE(userId, mappedNotification).catch(error => {
        logger.error('Failed to publish UPCOMING_FLIGHT to SSE', { 
          notificationId: notification.id, 
          userId, 
          error 
        });
      });

      // Enviar push notification (no esperar)
      this.sendPushNotification(userId, mappedNotification).catch(error => {
        logger.error('Failed to send UPCOMING_FLIGHT push', { 
          notificationId: notification.id, 
          userId, 
          error 
        });
      });

      logger.info('UPCOMING_FLIGHT notification created', { 
        userId, 
        flightTrackingId: flightTracking.id,
        notificationId: notification.id,
        flightNumber: flightTracking.flightNumber
      });

      return mappedNotification;
    } catch (error) {
      logger.error('Error creating UPCOMING_FLIGHT notification', { 
        userId, 
        flightTrackingId: flightTracking.id, 
        error 
      });
      throw error;
    }
  }

  /**
   * Crea notificaciones de actualización de vuelo de forma idempotente
   */
  async createFlightUpdateNotifications(
    userId: string,
    flightTrackingId: string,
    oldData: { status: string; gate?: string; terminal?: string; delay: number; },
    newData: { status: string; gate?: string; terminal?: string; delay: number; }
  ): Promise<Notification[]> {
    try {
      const notifications: Notification[] = [];
      const now = new Date();

      // Cambio de estado
      if (oldData.status !== newData.status) {
        const title = '🔄 Estado del vuelo actualizado';
        const message = `El estado cambió de ${oldData.status} a ${newData.status}`;
        
        const notification = await this.createFlightChangeNotification(
          userId,
          flightTrackingId,
          NotificationType.STATUS_CHANGE,
          title,
          message,
          {
            field: 'status',
            oldValue: oldData.status,
            newValue: newData.status,
            changeType: 'status',
            timestamp: now.toISOString()
          }
        );
        if (notification) notifications.push(notification);
      }

      // Cambio de puerta
      if (oldData.gate !== newData.gate && newData.gate) {
        const title = '🚪 Cambio de puerta';
        const message = `Puerta actualizada: ${oldData.gate || 'sin asignar'} → ${newData.gate}`;
        
        const notification = await this.createFlightChangeNotification(
          userId,
          flightTrackingId,
          NotificationType.GATE_CHANGE,
          title,
          message,
          {
            field: 'gate',
            oldValue: oldData.gate,
            newValue: newData.gate,
            changeType: 'gate',
            timestamp: now.toISOString()
          }
        );
        if (notification) notifications.push(notification);
      }

      // Cambio de terminal
      if (oldData.terminal !== newData.terminal && newData.terminal) {
        const title = '🏢 Cambio de terminal';
        const message = `Terminal actualizado: ${oldData.terminal || 'sin asignar'} → ${newData.terminal}`;
        
        const notification = await this.createFlightChangeNotification(
          userId,
          flightTrackingId,
          NotificationType.TERMINAL_CHANGE,
          title,
          message,
          {
            field: 'terminal',
            oldValue: oldData.terminal,
            newValue: newData.terminal,
            changeType: 'terminal',
            timestamp: now.toISOString()
          }
        );
        if (notification) notifications.push(notification);
      }

      // Cambio de retraso ≥5min
      const delayDiff = Math.abs(newData.delay - oldData.delay);
      if (delayDiff >= 5) {
        const isIncrease = newData.delay > oldData.delay;
        const title = isIncrease ? '⏰ Retraso en el vuelo' : '✅ Mejora en el horario';
        const message = isIncrease
          ? `⏰ Retraso adicional de ${delayDiff} minutos (total: ${newData.delay} min)`
          : `✅ Retraso reducido en ${delayDiff} minutos (total: ${newData.delay} min)`;

        const notification = await this.createFlightChangeNotification(
          userId,
          flightTrackingId,
          NotificationType.DELAY_CHANGE,
          title,
          message,
          {
            field: 'delay',
            oldValue: oldData.delay,
            newValue: newData.delay,
            delayDiff,
            changeType: 'delay',
            timestamp: now.toISOString()
          }
        );
        if (notification) notifications.push(notification);
      }

      logger.info('Flight update notifications processed', {
        userId,
        flightTrackingId,
        createdCount: notifications.length
      });

      return notifications;
    } catch (error) {
      logger.error('Error creating flight update notifications', { 
        userId, 
        flightTrackingId, 
        error 
      });
      throw error;
    }
  }

  /**
   * Helper method to create flight change notifications
   */
  private async createFlightChangeNotification(
    userId: string,
    flightTrackingId: string,
    type: NotificationType,
    title: string,
    message: string,
    meta: any
  ): Promise<Notification | null> {
    try {
      // Check if similar notification exists in recent time (avoid spam)
      const recentCutoff = new Date(Date.now() - 10 * 60 * 1000); // 10 minutes ago
      const existing = await prisma.notification.findFirst({
        where: {
          userId,
          flightTrackingId,
          type,
          title,
          createdAt: {
            gte: recentCutoff
          }
        }
      });

      if (existing) {
        logger.info('Similar notification already exists recently', { 
          userId, 
          flightTrackingId, 
          type, 
          title 
        });
        return null;
      }

      // Create new notification
      const notification = await prisma.notification.create({
        data: {
          userId,
          flightTrackingId,
          type,
          title,
          message,
          data: meta
        }
      });

      const mappedNotification: Notification = notification;

      // Publish via SSE (don't wait)
      this.publishNotificationToSSE(userId, mappedNotification).catch(error => {
        logger.error('Failed to publish notification to SSE', { 
          notificationId: notification.id, 
          userId, 
          error 
        });
      });

      // Send push notification (don't wait)
      this.sendPushNotification(userId, mappedNotification).catch(error => {
        logger.error('Failed to send push notification', { 
          notificationId: notification.id, 
          userId, 
          error 
        });
      });

      return mappedNotification;
    } catch (error) {
      logger.error('Error in createFlightChangeNotification', { 
        userId, 
        flightTrackingId, 
        type, 
        title, 
        error 
      });
      throw error;
    }
  }

  /**
   * Crea o obtiene notificación existente (idempotencia)
   */
  private async createOrGetNotification(
    userId: string,
    flightTrackingId: string,
    type: NotificationType,
    title: string,
    message: string,
    meta: any,
    dedupKey: string
  ): Promise<Notification | null> {
    try {
      // Buscar primero si existe
      const existing = await prisma.notification.findFirst({
        where: {
          userId,
          flightTrackingId,
          type,
          title: { contains: title.substring(0, 20) } // Partial match to avoid exact duplicates
        }
      });

      if (existing) {
        return null; // Ya existe, no crear duplicado
      }

      // Crear nueva notificación
      const notification = await prisma.notification.create({
        data: {
          userId,
          flightTrackingId,
          type,
          title,
          message,
          data: meta
        }
      });

      const mappedNotification: Notification = notification;

      // Publicar por SSE (no esperar)
      this.publishNotificationToSSE(userId, mappedNotification).catch(error => {
        logger.error('Failed to publish notification to SSE', { 
          notificationId: notification.id, 
          userId, 
          error 
        });
      });

      // Enviar push notification (no esperar)
      this.sendPushNotification(userId, mappedNotification).catch(error => {
        logger.error('Failed to send push notification', { 
          notificationId: notification.id, 
          userId, 
          error 
        });
      });

      return mappedNotification;
    } catch (error) {
      logger.error('Error in createOrGetNotification', { 
        userId, 
        flightTrackingId, 
        type, 
        error 
      });
      throw error;
    }
  }
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

    // Crear notificación en la BD
    const notification = await prisma.notification.create({
      data: {
        userId,
        flightTrackingId,
        type: change.type,
        title,
        message,
        data: JSON.stringify({
          field: change.field,
          oldValue: change.oldValue,
          newValue: change.newValue,
          significance: change.significance,
        }),
      },
    });

    // Publicar en Redis para SSE (no esperar)
    this.publishNotificationToSSE(userId, notification).catch(error => {
      logger.error('Failed to publish notification to SSE', { 
        notificationId: notification.id, 
        userId, 
        error 
      });
    });

    // Enviar push notification en paralelo (no bloquear)
    this.sendPushNotification(userId, notification).catch(error => {
      logger.error('Failed to send push notification', { 
        notificationId: notification.id, 
        userId, 
        error 
      });
    });

    return notification;
  }

  /**
   * Publica notificación en Redis para SSE
   */
  private async publishNotificationToSSE(userId: string, notification: Notification): Promise<void> {
    try {
      const channelName = `notify:user:${userId}`;
      const message = JSON.stringify({
        id: notification.id,
        type: notification.type,
        title: notification.title,
        message: notification.message,
        meta: notification.data, // Map data field to meta for frontend
        createdAt: notification.createdAt,
        flightTrackingId: notification.flightTrackingId
      });

      await connection.publish(channelName, message);
      
      logger.info('Notification published to SSE', { 
        notificationId: notification.id, 
        userId,
        channelName
      });
    } catch (error) {
      logger.error('Failed to publish notification to SSE', { 
        notificationId: notification.id, 
        userId, 
        error 
      });
    }
  }

  /**
   * Envía push notification para una notificación creada
   */
  private async sendPushNotification(userId: string, notification: Notification): Promise<void> {
    try {
      const metaData = notification.data as any; // Access data fields
      await this.pushService.sendPushToUser(userId, {
        title: notification.title,
        body: notification.message,
        url: metaData?.url || '/',
        data: { 
          notificationId: notification.id,
          type: notification.type,
          flightTrackingId: notification.flightTrackingId
        }
      });

      logger.info('Push notification sent', { 
        notificationId: notification.id, 
        userId,
        title: notification.title 
      });
    } catch (error) {
      logger.warn('Push notification failed', { 
        notificationId: notification.id, 
        userId, 
        error 
      });
    }
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
                tripId: true, // Incluir tripId
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
   * Obtiene notificaciones de vuelos para todos los viajes de un usuario
   */
  async getNotificationsByTrips(
    userId: string,
    tripIds: string[],
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
      if (tripIds.length === 0) {
        return {
          notifications: [],
          total: 0,
          page,
          totalPages: 0,
        };
      }

      const skip = (page - 1) * limit;
      const where = {
        flightTracking: {
          tripId: {
            in: tripIds,
          },
        },
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
                tripId: true,
                createdByUserId: true, // Para saber quién registró el vuelo
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
      logger.error('Error getting notifications by trips', { userId, tripIds, page, limit, unreadOnly, error });
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
