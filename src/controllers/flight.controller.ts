import { Response } from 'express';
import { ValidatedRequest } from '../middleware/validation.middleware';
import { RegisterFlightTrackingInput, CancelTrackingInput } from '../types/validation';
import { FlightTrackingService } from '../services/flight-tracking.service';
import { NotificationService } from '../services/notification.service';
import { createFlightProvider } from '../services/flight-provider.service';
import { JobManager } from '../jobs/job-manager';
import { logger } from '../config/logger';
import { calculatePollingInterval, calculateNextPollDate } from '../utils/polling';

export class FlightController {
  private flightTrackingService: FlightTrackingService;
  private notificationService: NotificationService;
  private jobManager: JobManager;

  constructor() {
    const flightProvider = createFlightProvider();
    this.notificationService = new NotificationService();
    this.flightTrackingService = new FlightTrackingService(flightProvider, this.notificationService);
    this.jobManager = new JobManager();
  }

  /**
   * Registra un vuelo para seguimiento
   */
  async registerFlightTracking(
    req: ValidatedRequest<RegisterFlightTrackingInput>,
    res: Response
  ): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { flightId, airline, flightNumber, scheduledDeparture, origin, destination } = req.validated.body;

      const flightData = {
        flightId,
        airline,
        flightNumber,
        scheduledDeparture: new Date(scheduledDeparture),
        origin,
        destination,
      };

      const tracking = await this.flightTrackingService.registerFlightTracking(userId, flightData);

      // Programar job de polling
      const interval = calculatePollingInterval(flightData.scheduledDeparture);
      const nextPollAt = calculateNextPollDate(interval);
      const delay = Math.max(0, nextPollAt.getTime() - Date.now());

      await this.jobManager.scheduleFlightPollingJob(
        tracking.id,
        tracking.flightId,
        userId,
        delay
      );

      logger.info('Flight tracking registered and job scheduled', {
        userId,
        trackingId: tracking.id,
        flightId,
        nextPollAt,
      });

      res.status(201).json({
        message: 'Flight tracking registered successfully',
        data: {
          trackingId: tracking.id,
          flightId: tracking.flightId,
          flightNumber: tracking.flightNumber,
          scheduledDeparture: tracking.scheduledDeparture,
          origin: tracking.origin,
          destination: tracking.destination,
          status: tracking.status,
          nextPollAt: tracking.nextPollAt,
          pollInterval: tracking.pollInterval,
        },
      });
    } catch (error) {
      logger.error('Error registering flight tracking', { error });
      res.status(500).json({
        error: 'Failed to register flight tracking',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Obtiene los vuelos en seguimiento de un usuario
   */
  async getUserFlightTrackings(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const trackings = await this.flightTrackingService.getUserFlightTrackings(userId);

      res.json({
        message: 'Flight trackings retrieved successfully',
        data: trackings.map(tracking => ({
          trackingId: tracking.id,
          flightId: tracking.flightId,
          flightNumber: tracking.flightNumber,
          airline: tracking.airline,
          scheduledDeparture: tracking.scheduledDeparture,
          origin: tracking.origin,
          destination: tracking.destination,
          status: tracking.status,
          gate: tracking.gate,
          terminal: tracking.terminal,
          delay: tracking.delay,
          isActive: tracking.isActive,
          lastPolledAt: tracking.lastPolledAt,
          nextPollAt: tracking.nextPollAt,
          createdAt: tracking.createdAt,
        })),
        count: trackings.length,
      });
    } catch (error) {
      logger.error('Error getting user flight trackings', { error });
      res.status(500).json({
        error: 'Failed to get flight trackings',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Cancela el seguimiento de un vuelo
   */
  async cancelFlightTracking(
    req: ValidatedRequest<CancelTrackingInput>,
    res: Response
  ): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { trackingId } = req.validated.params;

      const cancelled = await this.flightTrackingService.cancelFlightTracking(userId, trackingId);

      if (!cancelled) {
        res.status(404).json({
          error: 'Flight tracking not found or already cancelled',
        });
        return;
      }

      // Cancelar jobs pendientes
      await this.jobManager.cancelJobsForTracking(trackingId);

      logger.info('Flight tracking cancelled', { userId, trackingId });

      res.json({
        message: 'Flight tracking cancelled successfully',
        trackingId,
      });
    } catch (error) {
      logger.error('Error cancelling flight tracking', { error });
      res.status(500).json({
        error: 'Failed to cancel flight tracking',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Obtiene el estado actual de un vuelo específico
   */
  async getFlightStatus(req: any, res: Response): Promise<void> {
    try {
      const { flightId } = req.params;
      const flightProvider = createFlightProvider();
      
      const response = await flightProvider.getFlightData(flightId);

      if (!response.success) {
        res.status(404).json({
          error: 'Flight not found',
          details: response.error,
        });
        return;
      }

      res.json({
        message: 'Flight status retrieved successfully',
        data: response.data,
      });
    } catch (error) {
      logger.error('Error getting flight status', { error });
      res.status(500).json({
        error: 'Failed to get flight status',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
