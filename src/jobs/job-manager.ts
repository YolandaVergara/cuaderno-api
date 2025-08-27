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
  private flightPollingQueue: Queue<FlightPollingJobData> | null = null;
  private cleanupQueue: Queue | null = null;
  private flightTrackingService: FlightTrackingService;
  private notificationService: NotificationService;
  private isRedisAvailable: boolean = false;

  constructor() {
    // Inicializar servicios
    const flightProvider = createFlightProvider();
    this.notificationService = new NotificationService();
    this.flightTrackingService = new FlightTrackingService(flightProvider, this.notificationService);

    // Solo inicializar colas si Redis está disponible
    if (redis) {
      try {
        this.flightPollingQueue = new Queue<FlightPollingJobData>('flight-polling', {
          connection: redis as any,
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
          connection: redis as any,
          defaultJobOptions: {
            removeOnComplete: 10,
            removeOnFail: 5,
          },
        });

        this.isRedisAvailable = true;
        this.initializeWorkers();
        this.scheduleCleanupJobs();

        logger.info('JobManager initialized with Redis');
      } catch (error) {
        logger.error('Failed to initialize JobManager with Redis:', error);
        this.isRedisAvailable = false;
      }
    } else {
      logger.warn('JobManager running without Redis - jobs will be disabled');
      this.isRedisAvailable = false;
    }
  }

  private initializeWorkers(): void {
    if (!this.isRedisAvailable || !redis) return;

    // Worker para polling de vuelos
    new Worker<FlightPollingJobData>(
      'flight-polling',
      async (job: Job<FlightPollingJobData>) => {
        const { trackingId, flightId } = job.data;
        logger.info('Processing flight polling job', { trackingId, flightId });

        // Simular polling por ahora
        logger.info('Polling flight update', { trackingId, flightId });
        // TODO: Implementar await this.flightTrackingService.pollFlightUpdate(trackingId);
      },
      {
        connection: redis as any,
        concurrency: 5,
      }
    );

    // Worker para cleanup
    new Worker(
      'cleanup',
      async (job: Job) => {
        logger.info('Processing cleanup job', { type: job.name });

        if (job.name === 'cleanup-inactive') {
          await this.cleanupInactiveTrackings();
        }
      },
      {
        connection: redis as any,
        concurrency: 1,
      }
    );

    logger.info('Job workers initialized');
  }

  async schedulePollingJobs(): Promise<void> {
    if (!this.isRedisAvailable) {
      logger.warn('Cannot schedule polling jobs - Redis not available');
      return;
    }

    try {
      const activeTrackings = await this.flightTrackingService.getFlightsReadyForPolling();
      
      for (const tracking of activeTrackings) {
        const delay = tracking.nextPollAt ? Math.max(0, tracking.nextPollAt.getTime() - Date.now()) : 0;
        
        await this.flightPollingQueue!.add(
          'poll-flight',
          {
            trackingId: tracking.id,
            flightId: tracking.flightId,
            userId: tracking.userId,
          },
          {
            delay,
            jobId: `poll-${tracking.id}-${Date.now()}`,
          }
        );
      }

      logger.info('Polling jobs scheduled', { count: activeTrackings.length });
    } catch (error) {
      logger.error('Error scheduling polling jobs', { error });
    }
  }

  async scheduleFlightPollingJob(trackingId: string, flightId: string, userId: string, delay: number = 0): Promise<void> {
    if (!this.isRedisAvailable) {
      logger.warn('Cannot schedule flight polling job - Redis not available');
      return;
    }

    try {
      await this.flightPollingQueue!.add(
        'poll-flight',
        { trackingId, flightId, userId },
        {
          delay,
          jobId: `poll-${trackingId}-${Date.now()}`,
        }
      );

      logger.info('Flight polling job scheduled', { trackingId, delay });
    } catch (error) {
      logger.error('Error scheduling flight polling job', { error, trackingId });
    }
  }

  private async scheduleCleanupJobs(): Promise<void> {
    if (!this.isRedisAvailable) return;

    try {
      // Cleanup diario de trackings inactivos
      await this.cleanupQueue!.add(
        'cleanup-inactive',
        {},
        {
          repeat: { pattern: '0 2 * * *' }, // 2 AM diario
          jobId: 'daily-cleanup',
        }
      );

      logger.info('Cleanup jobs scheduled');
    } catch (error) {
      logger.error('Error scheduling cleanup jobs', { error });
    }
  }

  private async cleanupInactiveTrackings(): Promise<void> {
    try {
      logger.info('Running cleanup of inactive trackings');
      // TODO: Implementar lógica de cleanup
    } catch (error) {
      logger.error('Error during cleanup', { error });
    }
  }

  async cancelJobsForTracking(trackingId: string): Promise<void> {
    if (!this.isRedisAvailable) return;

    try {
      const jobs = await this.flightPollingQueue!.getJobs(['waiting', 'delayed']);
      const trackingJobs = jobs.filter(job => job.data.trackingId === trackingId);

      for (const job of trackingJobs) {
        await job.remove();
      }

      logger.info('Jobs cancelled for tracking', { trackingId, count: trackingJobs.length });
    } catch (error) {
      logger.error('Error cancelling jobs for tracking', { error, trackingId });
    }
  }

  async getQueueStats(): Promise<any> {
    if (!this.isRedisAvailable) {
      return { redis: false, queues: [] };
    }

    try {
      const [pollingStats, cleanupStats] = await Promise.all([
        this.flightPollingQueue!.getJobCounts(),
        this.cleanupQueue!.getJobCounts(),
      ]);

      return {
        redis: true,
        flightPolling: pollingStats,
        cleanup: cleanupStats,
      };
    } catch (error) {
      logger.error('Error getting queue stats', { error });
      return { redis: false, error: String(error) };
    }
  }

  async close(): Promise<void> {
    try {
      if (this.flightPollingQueue && this.cleanupQueue) {
        await Promise.all([
          this.flightPollingQueue.close(),
          this.cleanupQueue.close(),
        ]);
      }
      logger.info('JobManager closed');
    } catch (error) {
      logger.error('Error closing JobManager', { error });
    }
  }
}
