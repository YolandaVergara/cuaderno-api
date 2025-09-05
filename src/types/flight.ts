// Importamos los enums de Prisma
import { FlightStatus, StopReason, NotificationType } from '@prisma/client';

// Re-exportamos para compatibilidad
export { FlightStatus, StopReason, NotificationType };

export interface FlightData {
  flightId: string;
  airline: string;
  flightNumber: string;
  scheduledDeparture: Date;
  origin: string;
  destination: string;
  status: FlightStatus;
  gate?: string;
  terminal?: string;
  delay: number; // minutos
  actualDeparture?: Date;
  estimatedDeparture?: Date;
}

export interface FlightProviderResponse {
  success: boolean;
  data?: FlightData;
  error?: string;
}

export interface PollingConfig {
  interval: number; // seconds
  jitter: number; // percentage (0.1 = 10%)
  maxRetries: number;
  backoffMultiplier: number;
}

export interface FlightChangeDetection {
  hasChanges: boolean;
  changes: FlightChange[];
}

export interface FlightChange {
  type: NotificationType;
  field: string;
  oldValue: any;
  newValue: any;
  significance: 'minor' | 'major';
}

export interface NotificationData {
  flightId: string;
  flightNumber: string;
  change: FlightChange;
  scheduledDeparture: Date;
}
