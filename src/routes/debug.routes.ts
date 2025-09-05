import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { prisma } from '../config/database';
import { logger } from '../config/logger';
import { JobManager } from '../jobs/job-manager';
import { FlightTrackingService } from '../services/flight-tracking.service';
import { NotificationService } from '../services/notification.service';
import { createFlightProvider } from '../services/flight-provider.service';

const execAsync = promisify(exec);
const router = Router();

// Instancia del job manager para debugging
let jobManager: JobManager | null = null;
try {
  jobManager = new JobManager();
} catch (error) {
  logger.error('Failed to initialize JobManager for debug routes', { error });
}

/**
 * GET /debug/jobs/stats
 * Obtiene estadísticas de las colas de jobs
 */
router.get('/jobs/stats', async (req, res) => {
  try {
    if (!jobManager) {
      return res.json({
        redis: false,
        error: 'JobManager not available'
      });
    }

    const stats = await jobManager.getQueueStats();
    res.json(stats);
  } catch (error) {
    logger.error('Error getting job stats', { error });
    res.status(500).json({
      redis: false,
      error: String(error)
    });
  }
});

/**
 * GET /debug/flight-trackings
 * Obtiene todos los trackings de vuelos activos
 */
router.get('/flight-trackings', async (req, res) => {
  try {
    const trackings = await prisma.flightTracking.findMany({
      where: {
        isActive: true
      },
      orderBy: [
        { nextPollAt: 'asc' },
        { createdAt: 'desc' }
      ],
      take: 50 // Limitar para no sobrecargar
    });

    // Calcular información adicional
    const enrichedTrackings = trackings.map(tracking => {
      const now = new Date();
      const nextPoll = tracking.nextPollAt || now;
      const minutesUntilPoll = Math.round((nextPoll.getTime() - now.getTime()) / (1000 * 60));
      
      return {
        ...tracking,
        minutesUntilPoll,
        isOverdue: nextPoll < now
      };
    });

    res.json(enrichedTrackings);
  } catch (error) {
    logger.error('Error getting flight trackings', { error });
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /debug/force-poll/:trackingId
 * Fuerza el polling de un vuelo específico
 */
router.post('/force-poll/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;

    // Verificar que el tracking existe
    const tracking = await prisma.flightTracking.findUnique({
      where: { id: trackingId }
    });

    if (!tracking) {
      return res.status(404).json({ error: 'Tracking not found' });
    }

    // Crear instancia del servicio de tracking
    const flightProvider = createFlightProvider();
    const notificationService = new NotificationService();
    const flightTrackingService = new FlightTrackingService(flightProvider, notificationService);

    // Ejecutar polling manualmente
    await flightTrackingService.processFlightPolling(trackingId);

    // Programar el próximo job si hay JobManager disponible
    if (jobManager) {
      const delay = 0; // Inmediato
      await jobManager.scheduleFlightPollingJob(
        trackingId,
        tracking.flightId,
        tracking.createdByUserId,
        delay
      );
    }

    logger.info('Forced polling executed', { trackingId });
    res.json({ 
      success: true, 
      message: 'Polling forced successfully',
      trackingId 
    });

  } catch (error) {
    logger.error('Error forcing polling', { trackingId: req.params.trackingId, error });
    res.status(500).json({ 
      error: String(error),
      trackingId: req.params.trackingId 
    });
  }
});

/**
 * GET /debug/flight-tracking/:trackingId
 * Obtiene detalles específicos de un tracking
 */
router.get('/flight-tracking/:trackingId', async (req, res) => {
  try {
    const { trackingId } = req.params;

    const tracking = await prisma.flightTracking.findUnique({
      where: { id: trackingId }
    });

    if (!tracking) {
      return res.status(404).json({ error: 'Tracking not found' });
    }

    // Obtener notificaciones relacionadas
    const notifications = await prisma.notification.findMany({
      where: {
        userId: tracking.createdByUserId,
        // Buscar por flightNumber en el título o mensaje
        OR: [
          {
            title: {
              contains: tracking.flightNumber
            }
          },
          {
            message: {
              contains: tracking.flightNumber
            }
          }
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 10
    });

    res.json({
      tracking,
      notifications,
      relatedNotifications: notifications.length
    });

  } catch (error) {
    logger.error('Error getting tracking details', { trackingId: req.params.trackingId, error });
    res.status(500).json({ error: String(error) });
  }
});

/**
 * GET /debug/polling-ready
 * Obtiene vuelos listos para polling ahora mismo
 */
router.get('/polling-ready', async (req, res) => {
  try {
    const flightProvider = createFlightProvider();
    const notificationService = new NotificationService();
    const flightTrackingService = new FlightTrackingService(flightProvider, notificationService);

    const readyFlights = await flightTrackingService.getFlightsReadyForPolling();

    res.json({
      count: readyFlights.length,
      flights: readyFlights.map(flight => ({
        id: flight.id,
        flightNumber: flight.flightNumber,
        userId: flight.createdByUserId,
        nextPollAt: flight.nextPollAt,
        pollInterval: flight.pollInterval,
        retryCount: flight.retryCount,
        minutesOverdue: flight.nextPollAt 
          ? Math.round((Date.now() - flight.nextPollAt.getTime()) / (1000 * 60))
          : 0
      }))
    });

  } catch (error) {
    logger.error('Error getting polling-ready flights', { error });
    res.status(500).json({ error: String(error) });
  }
});

/**
 * POST /debug/schedule-all-jobs
 * Re-programa todos los jobs de polling
 */
router.post('/schedule-all-jobs', async (req, res) => {
  try {
    if (!jobManager) {
      return res.status(503).json({
        error: 'JobManager not available - Redis might be down'
      });
    }

    await jobManager.schedulePollingJobs();

    res.json({
      success: true,
      message: 'All polling jobs re-scheduled'
    });

  } catch (error) {
    logger.error('Error scheduling all jobs', { error });
    res.status(500).json({ error: String(error) });
  }
});

/**
 * GET /debug/system-status
 * Estado general del sistema de polling
 */
router.get('/system-status', async (req, res) => {
  try {
    // Stats de la base de datos
    const totalTrackings = await prisma.flightTracking.count();
    const activeTrackings = await prisma.flightTracking.count({
      where: { isActive: true }
    });
    const overdueTrackings = await prisma.flightTracking.count({
      where: {
        isActive: true,
        nextPollAt: {
          lt: new Date()
        }
      }
    });

    // Stats de notificaciones (últimas 24h)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentNotifications = await prisma.notification.count({
      where: {
        createdAt: {
          gte: yesterday
        },
        type: 'FLIGHT_UPDATE'
      }
    });

    // Stats de jobs si está disponible
    let jobStats = null;
    if (jobManager) {
      jobStats = await jobManager.getQueueStats();
    }

    res.json({
      database: {
        totalTrackings,
        activeTrackings,
        overdueTrackings,
        recentNotifications
      },
      jobs: jobStats,
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      }
    });

  } catch (error) {
    logger.error('Error getting system status', { error });
    res.status(500).json({ error: String(error) });
  }
});

// Endpoint temporal para forzar migración de base de datos
router.post('/force-migration', async (req, res) => {
  try {
    console.log('🚀 Forzando migración de base de datos...');
    
    // Primero generar el cliente de Prisma
    console.log('📦 Generando cliente de Prisma...');
    const generateResult = await execAsync('npx prisma generate');
    console.log('Generate result:', generateResult.stdout);
    
    // Luego ejecutar db push
    console.log('🗄️ Ejecutando db push...');
    const pushResult = await execAsync('npx prisma db push --accept-data-loss');
    console.log('Push result:', pushResult.stdout);
    
    res.json({
      success: true,
      message: 'Migration completed successfully',
      generateOutput: generateResult.stdout,
      pushOutput: pushResult.stdout
    });
    
  } catch (error: any) {
    console.error('❌ Error durante migración:', error);
    res.status(500).json({
      success: false,
      error: 'Migration failed',
      details: error.message,
      stdout: error.stdout,
      stderr: error.stderr
    });
  }
});

// Endpoint para verificar el esquema de la base de datos
router.get('/check-schema', async (req, res) => {
  try {
    // Intentar hacer una consulta simple para verificar si la tabla existe
    const result = await prisma.$queryRaw`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'flight_tracking'
      ORDER BY ordinal_position;
    `;
    
    res.json({
      success: true,
      columns: result
    });
    
  } catch (error: any) {
    console.error('❌ Error verificando esquema:', error);
    res.status(500).json({
      success: false,
      error: 'Schema check failed',
      details: error.message
    });
  }
});

export default router;
