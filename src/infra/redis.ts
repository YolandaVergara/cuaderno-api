import IORedis from "ioredis";
import { Queue, Worker, QueueEvents } from "bullmq";
import { z } from "zod";
import { logger } from "../config/logger";

const Env = z.object({
  REDIS_URL: z.string().url(),
}).parse(process.env);

logger.info('Initializing Redis connection', { 
  redisUrl: Env.REDIS_URL ? 'configured' : 'missing',
  urlLength: Env.REDIS_URL?.length 
});

// Parsear la URL de Redis para extraer componentes
const redisUrl = new URL(Env.REDIS_URL);

// Configuración de conexión con family: 0 para dual-stack (IPv4/IPv6)
const connectionConfig = {
  family: 0,                    // <- clave para dual-stack
  host: redisUrl.hostname,
  port: Number(redisUrl.port),
  username: redisUrl.username,
  password: redisUrl.password,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
};

// Un único objeto de conexión compartido por BullMQ con configuración robusta
export const connection = new IORedis(connectionConfig);

connection.on('error', (error) => {
  logger.error('Redis connection error:', { 
    error: error.message,
    code: (error as any).code,
    errno: (error as any).errno,
    hostname: (error as any).hostname,
    stack: error.stack
  });
});

connection.on('connect', () => {
  logger.info('Redis connected successfully');
});

connection.on('ready', () => {
  logger.info('Redis is ready to receive commands');
});

connection.on('close', () => {
  logger.warn('Redis connection closed');
});

connection.on('reconnecting', () => {
  logger.info('Redis reconnecting...');
});

// Colas / worker usan la misma configuración de conexión
export const pollQueue = new Queue("flight-poll", { connection: connectionConfig });
export const pollEvents = new QueueEvents("flight-poll", { connection: connectionConfig });

// Función para calcular el próximo delay
function nextDelayMs(now: Date, sched: Date): number {
  const diff = sched.getTime() - now.getTime();
  const h = diff / 3_600_000;
  
  let base =
    h >= 24*7 ? 6*60 :  // ≥ 7d: 6h
    h >= 24    ? 60   :  // < 7d ≥ 1d: 1h
    h >= 6     ? 30   :  // < 24h ≥ 6h: 30min
                 5;      // < 6h: 5min (minutos)
  
  // Jitter ±10%
  const jitter = base * (0.9 + Math.random() * 0.2);
  const delayMs = Math.max(60_000, Math.round(jitter) * 60_000); // Mínimo 1 minuto
  
  // Log para verificar el cálculo
  logger.info('Calculated polling delay', {
    hoursUntilFlight: h.toFixed(2),
    baseIntervalMin: base,
    jitterMultiplier: (jitter / base).toFixed(3),
    finalDelayMin: Math.round(delayMs / 60_000),
    finalDelayMs: delayMs
  });
  
  return delayMs;
}

export interface FlightJobData {
  userId: string;
  flightId: string;
  trackingId: string;
  scheduledAt: string;
}

export async function scheduleNext(jobData: FlightJobData) {
  const delay = nextDelayMs(new Date(), new Date(jobData.scheduledAt));
  const opts = {
    delay,
    attempts: 5,
    backoff: { type: "exponential" as const, delay: 30_000 },
    removeOnComplete: true,
    removeOnFail: { age: 86400 } // 1 día
    // NOTA: NO usamos repeat o cron - solo jobs one-shot con delay
  };
  
  const job = await pollQueue.add("pollFlight", jobData, opts);
  
  logger.info('📝 ONE-SHOT job scheduled (no repeatable/cron)', { 
    trackingId: jobData.trackingId,
    jobId: job.id,
    jobType: 'ONE_SHOT',
    delayMinutes: Math.round(delay / 1000 / 60),
    delayMs: delay,
    scheduledAt: jobData.scheduledAt,
    attempts: opts.attempts,
    backoffType: opts.backoff.type
  });
  
  return job;
}

// Worker para procesar jobs de polling
export const pollWorker = new Worker("flight-poll", async (job) => {
  const { trackingId, flightId, userId, scheduledAt } = job.data as FlightJobData;
  
  logger.info('🔄 Processing flight polling job', { 
    trackingId, 
    flightId, 
    userId,
    jobId: job.id,
    attempt: job.attemptsMade + 1,
    maxAttempts: job.opts.attempts || 1
  });
  
  try {
    // Verificar si debe continuar el polling
    const now = new Date();
    const scheduled = new Date(scheduledAt);
    const hoursAfterScheduled = (now.getTime() - scheduled.getTime()) / (1000 * 60 * 60);
    
    logger.info('⏰ Polling time check', {
      trackingId,
      scheduledTime: scheduledAt,
      currentTime: now.toISOString(),
      hoursAfterScheduled: hoursAfterScheduled.toFixed(2)
    });
    
    // Parar 2h después de la hora programada
    if (hoursAfterScheduled > 2) {
      logger.info('⛔ Stopping polling: 2+ hours after scheduled time', { 
        trackingId,
        hoursAfterScheduled: hoursAfterScheduled.toFixed(2)
      });
      return;
    }
    
    // Simular obtención de datos del vuelo
    logger.info('🛩️ Simulating flight data fetch', { trackingId, flightId });
    
    // Simular diferentes estados para testing
    const random = Math.random();
    let flightStatus = 'SCHEDULED';
    let shouldStop = false;
    
    if (hoursAfterScheduled > -1) { // 1h antes del vuelo
      if (random < 0.1) {
        flightStatus = 'DEPARTED';
        shouldStop = true;
      } else if (random < 0.05) {
        flightStatus = 'CANCELLED';
        shouldStop = true;
      } else if (random < 0.2) {
        flightStatus = 'BOARDING';
      }
    }
    
    logger.info('✈️ Flight status check', { 
      trackingId, 
      flightStatus, 
      shouldStop,
      randomValue: random.toFixed(3)
    });
    
    if (shouldStop) {
      logger.info('🏁 Stopping polling: Flight status indicates completion', { 
        trackingId, 
        flightStatus 
      });
      return;
    }
    
    // Reencolar para el siguiente polling (SOLO one-shot jobs, NO repeatables)
    logger.info('📅 Scheduling next polling job', { trackingId });
    await scheduleNext(job.data as FlightJobData);
    
    logger.info('✅ Polling job completed successfully', { trackingId });
    
  } catch (error) {
    logger.error('❌ Error processing flight polling job', { 
      error: (error as Error).message,
      trackingId,
      jobId: job.id,
      attempt: job.attemptsMade + 1
    });
    throw error; // Para que BullMQ maneje el retry
  }
}, { connection: connectionConfig });

pollWorker.on('completed', (job) => {
  logger.info('Flight polling job completed', { jobId: job.id });
});

pollWorker.on('failed', (job, err) => {
  logger.error('Flight polling job failed', { jobId: job?.id, error: err });
});

// Función para inicializar el worker de forma explícita
export async function initializeWorker(): Promise<void> {
  try {
    await connection.ping();
    logger.info('Worker initialized - Redis connection verified');
    
    // Verificar que las colas estén funcionando
    const queueInfo = await pollQueue.getWaiting();
    logger.info('Queue status checked', { waitingJobs: queueInfo.length });
    
  } catch (error) {
    logger.error('Failed to initialize worker', { error: (error as Error).message });
    throw error;
  }
}
