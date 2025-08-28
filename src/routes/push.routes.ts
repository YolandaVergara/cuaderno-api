/**
 * Push notification routes - complete implementation
 */

import { Router } from 'express';
import { z } from 'zod';
import { pushConfig } from '../config/push';
import { prisma } from '../config/database';
import { logger } from '../config/logger';

const router = Router();

// Validation schema
const SubscribeRequestSchema = z.object({
  userId: z.string().min(1, 'userId is required'),
  subscription: z.object({
    endpoint: z.string().url('endpoint must be a valid URL'),
    keys: z.object({
      p256dh: z.string().min(1, 'keys.p256dh is required'),
      auth: z.string().min(1, 'keys.auth is required')
    })
  })
});

/**
 * GET /api/push/public-key
 * Get VAPID public key for frontend subscription
 */
router.get('/public-key', (_req, res) => {
  if (!pushConfig) {
    res.status(503).json({ 
      error: 'Push notifications not configured',
      message: 'VAPID keys not set up'
    });
    return;
  }

  res.json({ 
    publicKey: pushConfig.vapidPublicKey 
  });
});

/**
 * POST /api/push/subscribe
 * Subscribe user to push notifications
 */
router.post('/subscribe', async (req, res) => {
  try {
    if (!pushConfig) {
      res.status(503).json({ 
        error: 'Push notifications not configured',
        message: 'VAPID keys not set up'
      });
      return;
    }

    // Validate request body
    const validatedData = SubscribeRequestSchema.parse(req.body);
    
    // For now, just log the subscription (until PushSubscription model is migrated)
    logger.info('Push subscription received (not saved - model pending)', { 
      userId: validatedData.userId,
      endpoint: validatedData.subscription.endpoint
    });

    res.status(201).json({
      message: 'Push subscription received (model migration pending)',
      userId: validatedData.userId,
      status: 'pending_migration'
    });

  } catch (error) {
    logger.error('Error subscribing to push notifications:', error);
    
    if (error instanceof z.ZodError) {
      res.status(400).json({
        error: 'Invalid request data',
        details: error.errors.map(e => `${e.path.join('.')}: ${e.message}`)
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to subscribe to push notifications',
      message: 'Internal server error'
    });
  }
});

/**
 * POST /api/push/test
 * Send test push notification
 */
router.post('/test', async (req, res) => {
  try {
    const { userId, message } = req.body;
    
    if (!userId) {
      res.status(400).json({
        error: 'userId is required'
      });
      return;
    }

    // Import push service here to avoid circular imports
    const { createPushService } = await import('../services/push.service');
    const pushService = createPushService(prisma);

    const testMessage = {
      title: message?.title || 'Test Notification',
      body: message?.body || 'This is a test push notification from your flight tracking app',
      icon: '/icon-192.png',
      url: '/?test=push'
    };

    const result = await pushService.sendPushToUser(userId, testMessage);

    res.json({
      message: 'Test push notification sent',
      userId,
      result
    });
  } catch (error) {
    logger.error('Error sending test push notification:', error);
    
    res.status(500).json({
      error: 'Failed to send test push notification',
      message: 'Internal server error'
    });
  }
});

export default router;
