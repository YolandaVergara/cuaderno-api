import { z } from 'zod';

// Validación para registrar seguimiento de vuelo
export const RegisterFlightTrackingSchema = z.object({
  body: z.object({
    flightId: z.string().min(1, 'Flight ID is required'),
    airline: z.string().min(1, 'Airline is required'),
    flightNumber: z.string().min(1, 'Flight number is required'),
    scheduledDeparture: z.string().datetime('Invalid datetime format'),
    origin: z.string().min(3, 'Origin must be at least 3 characters').max(3, 'Origin must be exactly 3 characters'),
    destination: z.string().min(3, 'Destination must be at least 3 characters').max(3, 'Destination must be exactly 3 characters'),
  }),
});

// Validación para obtener notificaciones
export const GetNotificationsSchema = z.object({
  query: z.object({
    page: z.string().optional().transform(val => val ? parseInt(val, 10) : 1),
    limit: z.string().optional().transform(val => val ? parseInt(val, 10) : 20),
    unreadOnly: z.string().optional().transform(val => val === 'true'),
  }),
});

// Validación para marcar notificaciones como leídas
export const MarkNotificationsReadSchema = z.object({
  body: z.object({
    notificationIds: z.array(z.string()).min(1, 'At least one notification ID is required'),
  }),
});

// Validación para cancelar seguimiento
export const CancelTrackingSchema = z.object({
  params: z.object({
    trackingId: z.string().min(1, 'Tracking ID is required'),
  }),
});

export type RegisterFlightTrackingInput = z.infer<typeof RegisterFlightTrackingSchema>;
export type GetNotificationsInput = z.infer<typeof GetNotificationsSchema>;
export type MarkNotificationsReadInput = z.infer<typeof MarkNotificationsReadSchema>;
export type CancelTrackingInput = z.infer<typeof CancelTrackingSchema>;
