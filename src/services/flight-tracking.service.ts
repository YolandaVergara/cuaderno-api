import { prisma } from '../config/database';
import type { FlightTracking } from '../../node_modules/.prisma/client';
import { $Enums } from '../../node_modules/.prisma/client';
import { logger } from '../config/logger';
import { FlightData, FlightChangeDetection, NotificationType } from '../types/flight';
import { calculatePollingInterval, calculateNextPollDate, shouldStopPolling } from '../utils/polling';
import { IFlightProvider } from './flight-provider.service';
// import { NotificationService } from './notification.service'; // Temporalmente comentado

export class FlightTrackingService {
  constructor(
    private flightProvider: IFlightProvider,
    private notificationService: any // Temporalmente any
  ) {}

  /**
   * Registra un vuelo para seguimiento (idempotente)
   */
  async registerFlightTracking(
    userId: string,
    flightData: Omit<FlightData, 'status' | 'delay'>
  ): Promise<FlightTracking> {
    try {
      // Verificar si ya existe
      const existing = await prisma.flightTracking.findUnique({
        where: {
          userId_flightId: {
            userId,
            flightId: flightData.flightId,
          },
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
          userId,
          flightId: flightData.flightId,
          airline: flightData.airline,
          flightNumber: flightData.flightNumber,
          scheduledDeparture: flightData.scheduledDeparture,
          origin: flightData.origin,
          destination: flightData.destination,
          status: $Enums.FlightStatus.SCHEDULED,
          gate: flightData.gate,
          terminal: flightData.terminal,
          delay: 0,
          pollInterval: interval,
          nextPollAt,
        },
      });

      logger.info('Flight tracking registered', {
        userId,
        flightId: flightData.flightId,
        nextPollAt,
        interval,
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

      // Verificar si debe parar el polling
      const stopCheck = shouldStopPolling(tracking.scheduledDeparture, tracking.status);
      if (stopCheck.shouldStop) {
        await this.stopFlightTracking(trackingId, stopCheck.reason as $Enums.StopReason);
        return;
      }

      // Obtener datos actuales del vuelo
      const response = await this.flightProvider.getFlightData(tracking.flightId);

      if (!response.success || !response.data) {
        await this.handlePollingError(tracking);
        return;
      }

      // Detectar cambios
      const changeDetection = this.detectFlightChanges(tracking, response.data);

      // Actualizar tracking con nuevos datos
      await this.updateFlightTracking(tracking, response.data, changeDetection);

      // Crear notificaciones si hay cambios significativos
      if (changeDetection.hasChanges) {
        await this.notificationService.createNotificationsForChanges(
          tracking.userId,
          tracking.id,
          changeDetection.changes
        );
      }

      logger.info('Flight polling completed', {
        trackingId,
        flightId: tracking.flightId,
        hasChanges: changeDetection.hasChanges,
        changes: changeDetection.changes.length,
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
    if (newData.status === $Enums.FlightStatus.CANCELLED && currentTracking.status !== $Enums.FlightStatus.CANCELLED) {
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
  async stopFlightTracking(trackingId: string, reason: $Enums.StopReason): Promise<void> {
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
          userId,
          isActive: true,
        },
        data: {
          isActive: false,
          stopReason: $Enums.StopReason.USER_CANCELLED,
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
          userId,
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
}
