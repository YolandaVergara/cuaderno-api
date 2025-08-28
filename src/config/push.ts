/**
 * Push notification configuration with VAPID keys
 * Validates environment variables using Zod
 */

import { z } from 'zod';

const PushConfigSchema = z.object({
  VAPID_PUBLIC_KEY: z.string().min(1, 'VAPID_PUBLIC_KEY is required'),
  VAPID_PRIVATE_KEY: z.string().min(1, 'VAPID_PRIVATE_KEY is required'),
  VAPID_SUBJECT: z.string().email('VAPID_SUBJECT must be a valid email or mailto: URL').or(
    z.string().startsWith('mailto:', 'VAPID_SUBJECT must be a valid email or mailto: URL')
  )
});

type PushConfig = z.infer<typeof PushConfigSchema>;

function loadPushConfig(): PushConfig | null {
  try {
    const config = {
      VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: process.env.VAPID_SUBJECT
    };

    // Si no hay config de push, devolver null (push notifications deshabilitadas)
    if (!config.VAPID_PUBLIC_KEY || !config.VAPID_PRIVATE_KEY || !config.VAPID_SUBJECT) {
      return null;
    }

    return PushConfigSchema.parse(config);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ');
      throw new Error(`Invalid push notification configuration: ${errorMessages}`);
    }
    throw error;
  }
}

// Export singleton instance - puede ser null si no está configurado
const pushConfigData = loadPushConfig();

export const pushConfig = pushConfigData ? {
  vapidPublicKey: pushConfigData.VAPID_PUBLIC_KEY,
  vapidPrivateKey: pushConfigData.VAPID_PRIVATE_KEY,
  vapidSubject: pushConfigData.VAPID_SUBJECT,
} : null;

export default pushConfig;
