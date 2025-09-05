import { Request, Response } from 'express';
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
      const { flightId, airline, flightNumber, scheduledDeparture, origin, destination, tripId, participants } = req.validated.body;

      const flightData = {
        flightId,
        airline,
        flightNumber,
        scheduledDeparture: new Date(scheduledDeparture),
        origin,
        destination,
      };

      // Si hay tripId y participants, registrar para todos los participantes
      if (tripId && participants && participants.length > 0) {
        const trackings: any[] = [];
        
        // Registrar tracking para cada participante
        for (const participantId of participants) {
          try {
            const tracking = await this.flightTrackingService.registerFlightTracking(participantId, flightData);
            trackings.push(tracking);
            
            // Programar job de polling para cada participante
            const interval = calculatePollingInterval(flightData.scheduledDeparture);
            const nextPollAt = calculateNextPollDate(interval);
            const delay = Math.max(0, nextPollAt.getTime() - Date.now());

            await this.jobManager.scheduleFlightPollingJob(
              tracking.id,
              tracking.flightId,
              participantId,
              delay
            );
          } catch (error) {
            logger.warn('Failed to register tracking for participant', { participantId, error });
          }
        }

        logger.info('Flight tracking registered for trip participants', {
          userId,
          tripId,
          flightId,
          participantCount: participants.length,
          successfulTrackings: trackings.length,
        });

        // Retornar el tracking del usuario principal
        const userTracking = trackings.find(t => t.userId === userId) || trackings[0];
        
        res.status(201).json({
          message: 'Flight tracking registered successfully for all trip participants',
          data: {
            trackingId: userTracking?.id,
            flightId: userTracking?.flightId,
            flightNumber: userTracking?.flightNumber,
            scheduledDeparture: userTracking?.scheduledDeparture,
            origin: userTracking?.origin,
            destination: userTracking?.destination,
            status: userTracking?.status,
            nextPollAt: userTracking?.nextPollAt,
            pollInterval: userTracking?.pollInterval,
            tripId,
            participantCount: trackings.length,
          },
        });
        return;
      }

      // Registro individual (sin viaje)
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
   * Busca vuelos por número de vuelo y fecha (usado por el frontend FlightAware integration)
   */
  async searchFlightByDate(req: Request, res: Response): Promise<void> {
    try {
      const { ident, date } = req.query;

      if (!ident || !date) {
        res.status(400).json({
          error: 'Missing required parameters: ident (flight number) and date',
          received: { ident: !!ident, date: !!date }
        });
        return;
      }

      // Create flightId in the format expected by our system
      const flightId = `${ident}-${date}`;
      
      // Use our flight provider to get flight data
      const flightProvider = createFlightProvider();
      const result = await flightProvider.getFlightData(flightId);

      if (!result.success) {
        res.status(404).json({
          error: result.error || 'Flight not found',
          query: { ident, date }
        });
        return;
      }

      // Map our internal FlightData to the format expected by the frontend
      const flightData = result.data!;
      const response = {
        flights: [{
          ident_iata: flightData.flightNumber,
          ident: flightData.flightNumber,
          operator: flightData.airline,
          scheduled_out: flightData.scheduledDeparture.toISOString(),
          estimated_out: flightData.estimatedDeparture?.toISOString() || flightData.scheduledDeparture.toISOString(),
          actual_out: flightData.actualDeparture?.toISOString(),
          status: flightData.status,
          departure_delay: flightData.delay * 60, // Convert minutes to seconds for FlightAware format
          origin: {
            name: this.getAirportName(flightData.origin),
            code_iata: flightData.origin,
            code_icao: flightData.origin
          },
          destination: {
            name: this.getAirportName(flightData.destination),
            code_iata: flightData.destination,
            code_icao: flightData.destination
          },
          gate_origin: flightData.gate,
          terminal_origin: flightData.terminal,
          gate_destination: null,
          terminal_destination: null,
          aircraft_type: null,
          registration: null,
          filed_ete: null
        }]
      };

      res.status(200).json(response);
    } catch (error) {
      logger.error('Error searching flight by date', { error, query: req.query });
      res.status(500).json({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Helper method to get airport name from code
   */
  private getAirportName(code: string): string {
    const airportMap: Record<string, string> = {
      'SVQ': 'Sevilla',
      'LIS': 'Lisboa',
      'MAD': 'Madrid',
      'BCN': 'Barcelona',
      'LEZL': 'Sevilla',
      'LPPT': 'Lisboa',
      'LEMD': 'Madrid',
      'LEBL': 'Barcelona',
      'JFK': 'John F. Kennedy International',
      'LAX': 'Los Angeles International',
      'LHR': 'London Heathrow',
      'CDG': 'Charles de Gaulle'
    };
    
    return airportMap[code] || code;
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
   * Obtiene información de un vuelo específico
   */
  async getFlightInfo(req: any, res: Response): Promise<void> {
    try {
      const { flightId } = req.params;
      const userId = req.userId;
      
      // Buscar tracking del usuario para este vuelo
      const tracking = await this.flightTrackingService.getUserFlightTracking(userId, flightId);
      
      if (!tracking) {
        res.status(404).json({
          error: 'Flight tracking not found',
          message: 'Flight is not being tracked by this user',
        });
        return;
      }

      res.json({
        message: 'Flight information retrieved successfully',
        data: {
          trackingId: tracking.id,
          flightId: tracking.flightId,
          flightNumber: tracking.flightNumber,
          airline: tracking.airline,
          origin: tracking.origin,
          destination: tracking.destination,
          scheduledDeparture: tracking.scheduledDeparture,
          status: tracking.status,
          gate: tracking.gate,
          terminal: tracking.terminal,
          delay: tracking.delay,
          createdAt: tracking.createdAt,
          updatedAt: tracking.updatedAt,
          lastPolledAt: tracking.lastPolledAt,
          nextPollAt: tracking.nextPollAt,
          pollInterval: tracking.pollInterval,
          retryCount: tracking.retryCount,
          isActive: tracking.isActive,
          stopReason: tracking.stopReason,
        },
      });
    } catch (error) {
      logger.error('Error getting flight info', { error });
      res.status(500).json({
        error: 'Failed to get flight information',
        details: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Obtiene el estado actual de un vuelo
   */
  async getFlightStatus(req: Request, res: Response): Promise<void> {
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
