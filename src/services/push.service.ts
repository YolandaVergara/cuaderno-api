/**
 * Web Push notification service usando Prisma directamente
 * Compatible con la estructura actual sin Firebase Data Connect
 */

import webpush from 'web-push';
import { PrismaClient } from '@prisma/client';
import { pushConfig } from '../config/push';
import { logger } from '../config/logger';

// Types
export interface PushSubscriptionPayload {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface PushMessage {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  data?: Record<string, any>;
  tag?: string;
  requireInteraction?: boolean;
  silent?: boolean;
}

export interface PushSubscriptionData {
  userId: string;
  subscription: PushSubscriptionPayload;
  userAgent?: string;
}

export function createPushService(prisma: PrismaClient) {
  // Si no hay configuración de push, devolver un servicio mock
  if (!pushConfig) {
    logger.warn('Push notifications disabled: VAPID keys not configured');
    return {
      async sendPushToUser(userId: string, message: PushMessage): Promise<{ sent: number; failed: number }> {
        logger.info('Push notification skipped (disabled)', { userId, title: message.title });
        return { sent: 0, failed: 0 };
      },
      getPublicKey(): string | null {
        return null;
      }
    };
  }

  // Configure web-push with VAPID keys
  webpush.setVapidDetails(
    pushConfig.vapidSubject,
    pushConfig.vapidPublicKey,
    pushConfig.vapidPrivateKey
  );

  return {
    /**
     * Get VAPID public key for frontend subscription
     */
    getPublicKey(): string {
      return pushConfig!.vapidPublicKey;
    },

    /**
     * Send push notification to specific user
     */
    async sendPushToUser(userId: string, message: PushMessage): Promise<{ sent: number; failed: number }> {
      try {
        // Get user's push subscriptions from Prisma
        // Nota: Necesitarás crear el modelo PushSubscription en prisma/schema.prisma
        const subscriptions = await prisma.pushSubscription.findMany({
          where: { userId }
        }).catch(() => {
          // Si la tabla no existe, log y continuar sin push
          logger.warn('PushSubscription table not found - push notifications disabled', { userId });
          return [];
        });

        if (!subscriptions || subscriptions.length === 0) {
          logger.info('No push subscriptions found for user', { userId });
          return { sent: 0, failed: 0 };
        }

        // Prepare push payload
        const payload = JSON.stringify({
          title: message.title,
          body: message.body,
          icon: message.icon || '/icon-192.png',
          badge: message.badge || '/icon-72.png',
          url: message.url || '/',
          data: message.data || {},
          tag: message.tag || 'flight-notification',
          requireInteraction: message.requireInteraction || false,
          silent: message.silent || false
        });

        // Send to all user subscriptions in parallel
        const sendPromises = subscriptions.map(async (sub: any) => {
          try {
            const subscription = {
              endpoint: sub.endpoint,
              keys: {
                p256dh: sub.p256dh,
                auth: sub.auth
              }
            };

            await webpush.sendNotification(subscription, payload);
            logger.info('Push notification sent successfully', { userId, endpoint: sub.endpoint });
            return { success: true, endpoint: sub.endpoint };
          } catch (error: any) {
            logger.warn('Push notification failed', { 
              userId, 
              endpoint: sub.endpoint, 
              error: error.message 
            });
            
            // Remove invalid subscriptions (410 Gone, 404 Not Found)
            if (error.statusCode === 410 || error.statusCode === 404) {
              logger.info('Removing invalid subscription', { endpoint: sub.endpoint });
              await prisma.pushSubscription.delete({
                where: { id: sub.id }
              }).catch(() => {
                logger.warn('Failed to delete invalid subscription', { id: sub.id });
              });
            }
            
            return { success: false, endpoint: sub.endpoint, error: error.message };
          }
        });

        const results = await Promise.allSettled(sendPromises);
        
        let sent = 0;
        let failed = 0;
        
        results.forEach((result: any) => {
          if (result.status === 'fulfilled' && result.value.success) {
            sent++;
          } else {
            failed++;
          }
        });

        logger.info('Push notifications completed', { userId, sent, failed });
        return { sent, failed };

      } catch (error) {
        logger.error('Error sending push notifications', { userId, error });
        throw new Error('Failed to send push notifications');
      }
    }
  };
}

export default createPushService;
