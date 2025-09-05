import { prisma } from '../config/database';
import type { FlightTracking } from '../../node_modules/.prisma/client';
import { logger } from '../config/logger';
import { FlightData, FlightChangeDetection, NotificationType, FlightStatus, StopReason } from '../types/flight';
import { calculatePollingInterval, calculateNextPollDate, shouldStopPolling } from '../utils/polling';
import { IFlightProvider } from './flight-provider.service';
import { NotificationService } from './notification.service';

export class FlightTrackingService {
  constructor(
    private flightProvider: IFlightProvider,
    private notificationService: NotificationService
  ) {}

  /**
   * Registra un vuelo para seguimiento (idempotente)
   * Soporta registro para múltiples usuarios de un viaje
   */
  async registerFlightTracking(
    userId: string,
    flightData: Omit<FlightData, 'status' | 'delay'>,
    options?: { tripId?: string; participants?: string[] }
  ): Promise<FlightTracking> {
    try {
      const { tripId, participants } = options || {};
      
      // Si hay tripId y participantes, registrar para todos los participantes
      if (tripId && participants && participants.length > 0) {
        const trackings: FlightTracking[] = [];
        
        for (const participantId of participants) {
          const tracking = await this.createSingleTracking(participantId, flightData, tripId);
          if (tracking) {
            trackings.push(tracking);
          }
        }
        
        logger.info('Flight tracking registered for all trip participants', {
          tripId,
          flightId: flightData.flightId,
          participantCount: participants.length,
          participants
        });
        
        // Retornar el tracking del usuario que lo registró
        return trackings.find(t => t.createdByUserId === userId) || trackings[0];
      }
      
      // Si no hay información del viaje, registrar solo para el usuario actual
      return await this.createSingleTracking(userId, flightData, tripId);
    } catch (error) {
      logger.error('Error registering flight tracking', { userId, flightData, options, error });
      throw error;
    }
  }

  /**
   * Crea un tracking individual para un usuario
   */
  private async createSingleTracking(
    userId: string,
    flightData: Omit<FlightData, 'status' | 'delay'>,
    tripId?: string
  ): Promise<FlightTracking> {
    try {
      // Verificar si ya existe (usando findFirst porque null en compound unique es complicado)
      const existing = await prisma.flightTracking.findFirst({
        where: {
          flightId: flightData.flightId,
          tripId: tripId || null,
        },
      });

      if (existing) {
        logger.info('Flight tracking already exists', { userId, flightId: flightData.flightId });
        return existing;
      }

      // Calcular intervalo inicial y próxima ejecución
      const interval = calculatePollingInterval(flightData.scheduledDeparture);
      const nextPollAt = calculateNextPollDate(interval);

      const tracking = await prisma.flightTracking.create({
        data: {
          createdByUserId: userId || null,
          tripId,
          flightId: flightData.flightId,
          airline: flightData.airline,
          flightNumber: flightData.flightNumber,
          scheduledDeparture: flightData.scheduledDeparture,
          origin: flightData.origin,
          destination: flightData.destination,
          status: FlightStatus.SCHEDULED,
          gate: flightData.gate,
          terminal: flightData.terminal,
          delay: 0,
          pollInterval: interval,
          nextPollAt,
        },
      });

      // Check if flight is already within 6 hours - create upcoming notification immediately
      const hoursUntilDeparture = (flightData.scheduledDeparture.getTime() - Date.now()) / (1000 * 60 * 60);
      if (hoursUntilDeparture <= 6 && hoursUntilDeparture > 0) {
        logger.info('Flight is within 6h threshold, creating UPCOMING notification', {
          userId,
          flightId: tracking.flightId,
          hoursUntilDeparture
        });

        await this.notificationService.createUpcomingFlightNotification(userId, {
          id: tracking.id,
          flightId: tracking.flightId,
          flightNumber: tracking.flightNumber,
          airline: tracking.airline,
          origin: tracking.origin,
          destination: tracking.destination,
          scheduledDeparture: tracking.scheduledDeparture,
          status: tracking.status,
          gate: tracking.gate || undefined,
          terminal: tracking.terminal || undefined,
          delay: tracking.delay
        });
      }

      logger.info('Flight tracking registered', {
        userId,
        flightId: flightData.flightId,
        nextPollAt,
        interval,
        upcomingNotificationCreated: hoursUntilDeparture <= 6
      });

      return tracking;
    } catch (error) {
      logger.error('Error registering flight tracking', { userId, flightData, error });
      throw error;
    }
  }

  /**
   * Obtiene los vuelos activos listos para polling
   */
  async getFlightsReadyForPolling(): Promise<FlightTracking[]> {
    try {
      const now = new Date();
      return await prisma.flightTracking.findMany({
        where: {
          isActive: true,
          nextPollAt: {
            lte: now,
          },
        },
        orderBy: {
          nextPollAt: 'asc',
        },
      });
    } catch (error) {
      logger.error('Error getting flights ready for polling', { error });
      throw error;
    }
  }

  /**
   * Procesa un vuelo individual
   */
  async processFlightPolling(trackingId: string): Promise<void> {
    try {
      const tracking = await prisma.flightTracking.findUnique({
        where: { id: trackingId },
      });

      if (!tracking || !tracking.isActive) {
        logger.warn('Flight tracking not found or inactive', { trackingId });
        return;
      }

      // Check if we just crossed the 6h threshold (for UPCOMING notification)
      const hoursUntilDeparture = (tracking.scheduledDeparture.getTime() - Date.now()) / (1000 * 60 * 60);
      const wasOver6h = tracking.pollInterval === 6 * 60 * 60 || tracking.pollInterval === 1 * 60 * 60; // Was in 6h or 1h interval
      const isNowUnder6h = hoursUntilDeparture <= 6;

      if (wasOver6h && isNowUnder6h && hoursUntilDeparture > 0) {
        logger.info('Crossed T-6h threshold, creating UPCOMING notification', {
          trackingId,
          flightId: tracking.flightId,
          hoursUntilDeparture
        });

        await this.notificationService.createUpcomingFlightNotification(tracking.createdByUserId, {
          id: tracking.id,
          flightId: tracking.flightId,
          flightNumber: tracking.flightNumber,
          airline: tracking.airline,
          origin: tracking.origin,
          destination: tracking.destination,
          scheduledDeparture: tracking.scheduledDeparture,
          status: tracking.status,
          gate: tracking.gate || undefined,
          terminal: tracking.terminal || undefined,
          delay: tracking.delay
        });
      }

      // Verificar si debe parar el polling
      const stopCheck = shouldStopPolling(tracking.scheduledDeparture, tracking.status);
      if (stopCheck.shouldStop) {
        await this.stopFlightTracking(trackingId, stopCheck.reason as StopReason);
        return;
      }

      // Obtener datos actuales del vuelo
      const response = await this.flightProvider.getFlightData(tracking.flightId);

      if (!response.success || !response.data) {
        await this.handlePollingError(tracking);
        return;
      }

      // Store old data for change detection
      const oldData = {
        status: tracking.status,
        gate: tracking.gate || undefined,
        terminal: tracking.terminal || undefined,
        delay: tracking.delay
      };

      const newData = {
        status: response.data.status,
        gate: response.data.gate,
        terminal: response.data.terminal,
        delay: response.data.delay
      };

      // Detectar cambios (legacy method)
      const changeDetection = this.detectFlightChanges(tracking, response.data);

      // Create flight update notifications using new method
      if (hoursUntilDeparture <= 6 && hoursUntilDeparture >= -2) { // Only during T-6h to T+2h window
        await this.notificationService.createFlightUpdateNotifications(
          tracking.createdByUserId,
          tracking.id,
          oldData,
          newData
        );
      } else if (changeDetection.hasChanges) {
        // Fallback to legacy notification system for flights outside T-6h window
        await this.notificationService.createNotificationsForChanges(
          tracking.createdByUserId,
          tracking.id,
          changeDetection.changes
        );
      }

      // Actualizar tracking con nuevos datos
      await this.updateFlightTracking(tracking, response.data, changeDetection);

      logger.info('Flight polling completed', {
        trackingId,
        flightId: tracking.flightId,
        hasChanges: changeDetection.hasChanges,
        changes: changeDetection.changes.length,
        hoursUntilDeparture,
        isInActiveWindow: hoursUntilDeparture <= 6 && hoursUntilDeparture >= -2
      });
    } catch (error) {
      logger.error('Error processing flight polling', { trackingId, error });
      // En caso de error inesperado, intentar reagendar
      const tracking = await prisma.flightTracking.findUnique({ where: { id: trackingId } });
      if (tracking) {
        await this.handlePollingError(tracking);
      }
    }
  }

  /**
   * Detecta cambios significativos en el vuelo
   */
  private detectFlightChanges(
    currentTracking: FlightTracking,
    newData: FlightData
  ): FlightChangeDetection {
    const changes = [];

    // Cambio de estado
    if (currentTracking.status !== newData.status) {
      changes.push({
        type: NotificationType.STATUS_CHANGE,
        field: 'status',
        oldValue: currentTracking.status,
        newValue: newData.status,
        significance: 'major' as const,
      });
    }

    // Cambio de puerta
    if (currentTracking.gate !== newData.gate) {
      changes.push({
        type: NotificationType.GATE_CHANGE,
        field: 'gate',
        oldValue: currentTracking.gate,
        newValue: newData.gate,
        significance: 'major' as const,
      });
    }

    // Cambio de terminal
    if (currentTracking.terminal !== newData.terminal) {
      changes.push({
        type: NotificationType.TERMINAL_CHANGE,
        field: 'terminal',
        oldValue: currentTracking.terminal,
        newValue: newData.terminal,
        significance: 'major' as const,
      });
    }

    // Cambio de retraso significativo (≥5 minutos)
    const delayDifference = Math.abs(newData.delay - currentTracking.delay);
    if (delayDifference >= 5) {
      changes.push({
        type: NotificationType.DELAY_CHANGE,
        field: 'delay',
        oldValue: currentTracking.delay,
        newValue: newData.delay,
        significance: delayDifference >= 30 ? 'major' as const : 'minor' as const,
      });
    }

    // Cancelación
    if (newData.status === FlightStatus.CANCELLED && currentTracking.status !== FlightStatus.CANCELLED) {
      changes.push({
        type: NotificationType.FLIGHT_CANCELLED,
        field: 'status',
        oldValue: currentTracking.status,
        newValue: newData.status,
        significance: 'major' as const,
      });
    }

    return {
      hasChanges: changes.length > 0,
      changes,
    };
  }

  /**
   * Actualiza el tracking con nuevos datos
   */
  private async updateFlightTracking(
    tracking: FlightTracking,
    newData: FlightData,
    changeDetection: FlightChangeDetection
  ): Promise<void> {
    // Calcular nuevo intervalo basado en tiempo restante
    const newInterval = calculatePollingInterval(tracking.scheduledDeparture);
    const nextPollAt = calculateNextPollDate(newInterval);

    await prisma.flightTracking.update({
      where: { id: tracking.id },
      data: {
        status: newData.status,
        gate: newData.gate,
        terminal: newData.terminal,
        delay: newData.delay,
        lastPolledAt: new Date(),
        nextPollAt,
        pollInterval: newInterval,
        retryCount: 0, // Reset retry count on successful poll
        updatedAt: new Date(),
      },
    });
  }

  /**
   * Maneja errores de polling con exponential backoff
   */
  private async handlePollingError(tracking: FlightTracking): Promise<void> {
    const newRetryCount = tracking.retryCount + 1;
    
    if (newRetryCount > 5) {
      // Después de 5 reintentos, volver al intervalo normal
      const normalInterval = calculatePollingInterval(tracking.scheduledDeparture);
      const nextPollAt = calculateNextPollDate(normalInterval);
      
      await prisma.flightTracking.update({
        where: { id: tracking.id },
        data: {
          retryCount: 0,
          nextPollAt,
          pollInterval: normalInterval,
        },
      });
      
      logger.warn('Max retries reached, returning to normal interval', {
        trackingId: tracking.id,
        flightId: tracking.flightId,
      });
    } else {
      // Aplicar exponential backoff
      const nextPollAt = calculateNextPollDate(tracking.pollInterval, newRetryCount);
      
      await prisma.flightTracking.update({
        where: { id: tracking.id },
        data: {
          retryCount: newRetryCount,
          nextPollAt,
        },
      });
      
      logger.warn('Polling error, applying backoff', {
        trackingId: tracking.id,
        flightId: tracking.flightId,
        retryCount: newRetryCount,
        nextPollAt,
      });
    }
  }

  /**
   * Detiene el seguimiento de un vuelo
   */
  async stopFlightTracking(trackingId: string, reason: StopReason): Promise<void> {
    try {
      await prisma.flightTracking.update({
        where: { id: trackingId },
        data: {
          isActive: false,
          stopReason: reason,
          updatedAt: new Date(),
        },
      });

      logger.info('Flight tracking stopped', { trackingId, reason });
    } catch (error) {
      logger.error('Error stopping flight tracking', { trackingId, reason, error });
      throw error;
    }
  }

  /**
   * Cancela el seguimiento de un vuelo por parte del usuario
   */
  async cancelFlightTracking(userId: string, trackingId: string): Promise<boolean> {
    try {
      const result = await prisma.flightTracking.updateMany({
        where: {
          id: trackingId,
          createdByUserId: userId,
          isActive: true,
        },
        data: {
          isActive: false,
          stopReason: StopReason.USER_CANCELLED,
          updatedAt: new Date(),
        },
      });

      logger.info('Flight tracking cancelled by user', { userId, trackingId });
      return result.count > 0;
    } catch (error) {
      logger.error('Error cancelling flight tracking', { userId, trackingId, error });
      throw error;
    }
  }

  /**
   * Obtiene todos los seguimientos activos de un usuario
   */
  async getUserFlightTrackings(userId: string): Promise<FlightTracking[]> {
    try {
      return await prisma.flightTracking.findMany({
        where: {
          createdByUserId: userId,
          isActive: true,
        },
        orderBy: {
          scheduledDeparture: 'asc',
        },
      });
    } catch (error) {
      logger.error('Error getting user flight trackings', { userId, error });
      throw error;
    }
  }

  /**
   * Obtiene todos los seguimientos activos de los viajes de un usuario
   */
  async getFlightTrackingsByTrips(tripIds: string[]): Promise<FlightTracking[]> {
    try {
      if (tripIds.length === 0) {
        return [];
      }

      return await prisma.flightTracking.findMany({
        where: {
          tripId: {
            in: tripIds,
          },
          isActive: true,
        },
        orderBy: {
          scheduledDeparture: 'asc',
        },
      });
    } catch (error) {
      logger.error('Error getting flight trackings by trips', { tripIds, error });
      throw error;
    }
  }

  /**
   * Obtiene un tracking específico de un usuario por flightId
   */
  async getUserFlightTracking(userId: string, flightId: string): Promise<FlightTracking | null> {
    try {
      return await prisma.flightTracking.findFirst({
        where: {
          createdByUserId: userId,
          flightId,
          isActive: true,
        },
      });
    } catch (error) {
      logger.error('Error getting user flight tracking', { userId, flightId, error });
      throw error;
    }
  }
}
