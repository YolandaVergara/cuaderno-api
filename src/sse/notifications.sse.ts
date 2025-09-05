/**
 * Server-Sent Events handler for real-time notifications
 */

import { Request, Response } from 'express';
import { connection } from '../infra/redis';
import { logger } from '../config/logger';

export const notificationsSse = async (req: Request, res: Response): Promise<void> => {
  // Get userId from authenticated request (set by authenticateUser middleware)
  const userId = (req as any).authenticatedUserId || (req as any).userId;
  
  if (!userId) {
    res.status(401).json({ error: 'Authentication required for SSE notifications' });
    return;
  }

  // Extra validation: En producción, rechazar usuarios de desarrollo/demo por seguridad
  if (process.env.NODE_ENV === 'production') {
    const devUserPatterns = ['demo-user', 'test-user', 'dev-user', 'example-user'];
    if (devUserPatterns.includes(userId.toLowerCase())) {
      logger.warn('Rejected development user in production SSE', { userId });
      res.status(403).json({ 
        error: 'Development users not allowed in production',
        userId 
      });
      return;
    }
  }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': req.get('Origin') || '*',
    'Access-Control-Allow-Credentials': 'true'
  });

  logger.info('SSE connection established', { userId });

  // Create Redis subscriber (duplicate connection for pub/sub)
  let subscriber: any = null;
  let heartbeat: NodeJS.Timeout | null = null;
  const channelName = `notify:user:${userId}`;

  try {
    subscriber = connection.duplicate();
    
    // Handle Redis connection errors
    subscriber.on('error', (error: any) => {
      logger.error('SSE Redis subscriber error', { userId, error: error.message });
    });

    // Subscribe to user notifications
    await subscriber.subscribe(channelName);
    
    // Handle incoming messages
    subscriber.on('message', (channel: string, message: string) => {
      if (channel === channelName) {
        try {
          const notification = JSON.parse(message);
          res.write(`event: notification\n`);
          res.write(`data: ${JSON.stringify(notification)}\n\n`);
          
          logger.info('SSE notification sent', { 
            userId, 
            notificationId: notification.id 
          });
        } catch (error) {
          logger.error('Error parsing SSE notification', { userId, error });
        }
      }
    });

    // Heartbeat every 25 seconds to keep connection alive
    heartbeat = setInterval(() => {
      try {
        res.write(':\n\n'); // Comment line as heartbeat
      } catch (error) {
        logger.warn('SSE heartbeat failed', { userId, error });
      }
    }, 25000);

    // Send initial connection confirmation
    res.write(`event: connected\n`);
    res.write(`data: ${JSON.stringify({ message: 'SSE connected', userId })}\n\n`);

  } catch (error) {
    logger.error('Error setting up SSE subscriber', { userId, error });
    res.status(500).end();
    return;
  }

  // Cleanup function
  const cleanup = () => {
    logger.info('SSE cleaning up connection', { userId });
    
    if (heartbeat) {
      clearInterval(heartbeat);
      heartbeat = null;
    }
    
    if (subscriber) {
      try {
        subscriber.unsubscribe(channelName);
        subscriber.disconnect();
      } catch (error) {
        logger.warn('Error cleaning up SSE subscriber', { userId, error });
      }
      subscriber = null;
    }
  };

  // Cleanup on client disconnect
  req.on('close', cleanup);
  req.on('error', (error) => {
    logger.error('SSE connection error', { userId, error });
    cleanup();
  });

  // Cleanup on response finish/error
  res.on('error', (error) => {
    logger.error('SSE response error', { userId, error });
    cleanup();
  });

  res.on('close', cleanup);
};
