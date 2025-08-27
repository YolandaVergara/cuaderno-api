import { Queue, Worker, Job } from 'bullmq';
import { redis } from '../config/redis';
import { logger } from '../config/logger';
import { FlightTrackingService } from '../services/flight-tracking.service';
import { NotificationService } from '../services/notification.service';
import { createFlightProvider } from '../services/flight-provider.service';

export interface FlightPollingJobData {
  trackingId: string;
  flightId: string;
  userId: string;
}

export class JobManager {
  private flightPollingQueue: Queue<FlightPollingJobData>;
  private cleanupQueue: Queue;
  private flightTrackingService: FlightTrackingService;
  private notificationService: NotificationService;

  constructor() {
    // Inicializar servicios
    const flightProvider = createFlightProvider();
    this.notificationService = new NotificationService();
    this.flightTrackingService = new FlightTrackingService(flightProvider, this.notificationService);

    // Inicializar colas con manejo de errores
    try {
      this.flightPollingQueue = new Queue<FlightPollingJobData>('flight-polling', {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        },
      });

      this.cleanupQueue = new Queue('cleanup', {
        connection: redis,
        defaultJobOptions: {
          removeOnComplete: 10,
          removeOnFail: 5,
        },
      });

      this.initializeWorkers();
      this.scheduleCleanupJobs();
      
      logger.info('JobManager initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize JobManager:', error);
      throw error;
    }
  }

  /**
   * Inicializa los workers para procesar jobs
   */
  private initializeWorkers(): void {
    // Worker para polling de vuelos
    new Worker<FlightPollingJobData>(
      'flight-polling',
      async (job: Job<FlightPollingJobData>) => {
        const { trackingId, flightId } = job.data;
        logger.info('Processing flight polling job', { trackingId, flightId, jobId: job.id });
        
        await this.flightTrackingService.processFlightPolling(trackingId);
        
        // Reagendar el próximo job si es necesario
        await this.scheduleNextPollingJob(trackingId);
      },
      {
        connection: redis,
        concurrency: 5, // Procesar hasta 5 vuelos simultáneamente
      }
    );

    // Worker para limpieza
    new Worker(
      'cleanup',
      async (job: Job) => {
        logger.info('Processing cleanup job', { jobId: job.id, jobName: job.name });
        
        switch (job.name) {
          case 'cleanup-notifications':
            await this.notificationService.cleanupOldNotifications();
            break;
          case 'cleanup-inactive-trackings':
            await this.cleanupInactiveTrackings();
            break;
          default:
            logger.warn('Unknown cleanup job', { jobName: job.name });
        }
      },
      {
        connection: redis,
        concurrency: 1,
      }
    );

    logger.info('Job workers initialized');
  }

  /**
   * Programa el próximo job de polling para un tracking
   */
  async scheduleNextPollingJob(trackingId: string): Promise<void> {
    try {
      // Obtener información actualizada del tracking
      const tracking = await this.flightTrackingService.getUserFlightTrackings(''); // Necesitamos el tracking por ID
      
      // Aquí necesitaríamos una función para obtener un tracking específico
      // Por ahora, simplificamos programando todos los vuelos activos
      await this.schedulePollingJobs();
    } catch (error) {
      logger.error('Error scheduling next polling job', { trackingId, error });
    }
  }

  /**
   * Programa jobs de polling para todos los vuelos activos listos
   */
  async schedulePollingJobs(): Promise<void> {
    try {
      const readyFlights = await this.flightTrackingService.getFlightsReadyForPolling();
      
      for (const flight of readyFlights) {
        const delay = Math.max(0, flight.nextPollAt!.getTime() - Date.now());
        
        await this.flightPollingQueue.add(
          'poll-flight',
          {
            trackingId: flight.id,
            flightId: flight.flightId,
            userId: flight.userId,
          },
          {
            delay,
            jobId: `poll-${flight.id}-${Date.now()}`, // Job único
          }
        );
      }

      logger.info('Polling jobs scheduled', { count: readyFlights.length });
    } catch (error) {
      logger.error('Error scheduling polling jobs', { error });
    }
  }

  /**
   * Programa un job de polling para un vuelo específico
   */
  async scheduleFlightPollingJob(
    trackingId: string,
    flightId: string,
    userId: string,
    delay: number
  ): Promise<void> {
    try {
      await this.flightPollingQueue.add(
        'poll-flight',
        {
          trackingId,
          flightId,
          userId,
        },
        {
          delay,
          jobId: `poll-${trackingId}-${Date.now()}`,
        }
      );

      logger.info('Flight polling job scheduled', { trackingId, flightId, delay });
    } catch (error) {
      logger.error('Error scheduling flight polling job', { trackingId, flightId, error });
    }
  }

  /**
   * Programa jobs de limpieza recurrentes
   */
  private async scheduleCleanupJobs(): Promise<void> {
    try {
      // Limpiar notificaciones antiguas - diario a las 2:00 AM
      await this.cleanupQueue.add(
        'cleanup-notifications',
        {},
        {
          repeat: {
            pattern: '0 2 * * *', // Cron pattern
          },
          jobId: 'cleanup-notifications-daily',
        }
      );

      // Limpiar trackings inactivos - diario a las 3:00 AM
      await this.cleanupQueue.add(
        'cleanup-inactive-trackings',
        {},
        {
          repeat: {
            pattern: '0 3 * * *',
          },
          jobId: 'cleanup-trackings-daily',
        }
      );

      logger.info('Cleanup jobs scheduled');
    } catch (error) {
      logger.error('Error scheduling cleanup jobs', { error });
    }
  }

  /**
   * Limpia trackings inactivos antiguos
   */
  private async cleanupInactiveTrackings(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 7); // Trackings inactivos de más de 7 días

      // Aquí necesitaríamos acceso directo a Prisma o un método en el servicio
      // Por simplicidad, lo dejamos como placeholder
      logger.info('Cleanup inactive trackings job executed', { cutoffDate });
    } catch (error) {
      logger.error('Error cleaning up inactive trackings', { error });
    }
  }

  /**
   * Cancela todos los jobs pendientes para un tracking
   */
  async cancelJobsForTracking(trackingId: string): Promise<void> {
    try {
      const jobs = await this.flightPollingQueue.getJobs(['waiting', 'delayed']);
      
      for (const job of jobs) {
        if (job.data.trackingId === trackingId) {
          await job.remove();
        }
      }

      logger.info('Jobs cancelled for tracking', { trackingId });
    } catch (error) {
      logger.error('Error cancelling jobs for tracking', { trackingId, error });
    }
  }

  /**
   * Obtiene estadísticas de las colas
   */
  async getQueueStats(): Promise<any> {
    try {
      const [pollingStats, cleanupStats] = await Promise.all([
        this.flightPollingQueue.getJobCounts(),
        this.cleanupQueue.getJobCounts(),
      ]);

      return {
        flightPolling: pollingStats,
        cleanup: cleanupStats,
      };
    } catch (error) {
      logger.error('Error getting queue stats', { error });
      throw error;
    }
  }

  /**
   * Cierra las conexiones de forma limpia
   */
  async close(): Promise<void> {
    try {
      await Promise.all([
        this.flightPollingQueue.close(),
        this.cleanupQueue.close(),
      ]);
      logger.info('Job manager closed');
    } catch (error) {
      logger.error('Error closing job manager', { error });
    }
  }
}
