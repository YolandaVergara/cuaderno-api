// Definimos nuestros propios enums para compatibilidad
export enum FlightStatus {
  SCHEDULED = 'SCHEDULED',
  DELAYED = 'DELAYED',
  BOARDING = 'BOARDING',
  DEPARTED = 'DEPARTED',
  ARRIVED = 'ARRIVED',
  CANCELLED = 'CANCELLED',
  DIVERTED = 'DIVERTED'
}

export enum StopReason {
  DEPARTED = 'DEPARTED',
  CANCELLED = 'CANCELLED',
  TIMEOUT = 'TIMEOUT',
  USER_CANCELLED = 'USER_CANCELLED'
}

export enum NotificationType {
  STATUS_CHANGE = 'STATUS_CHANGE',
  GATE_CHANGE = 'GATE_CHANGE',
  TERMINAL_CHANGE = 'TERMINAL_CHANGE',
  DELAY_CHANGE = 'DELAY_CHANGE',
  FLIGHT_CANCELLED = 'FLIGHT_CANCELLED',
  UPCOMING_FLIGHT = 'UPCOMING_FLIGHT',
  FLIGHT_UPDATE = 'FLIGHT_UPDATE',
  DEPARTED = 'DEPARTED'
}

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
