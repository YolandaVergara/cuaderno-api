import { DateTime } from 'luxon';

export interface PollingIntervals {
  sevenDaysOrMore: number; // 6 horas
  lessThanSevenDays: number; // 1 hora
  lessThan24Hours: number; // 30 minutos
  lessThan6Hours: number; // 5 minutos
}

export const POLLING_INTERVALS: PollingIntervals = {
  sevenDaysOrMore: 6 * 60 * 60, // 6 horas en segundos
  lessThanSevenDays: 60 * 60, // 1 hora en segundos
  lessThan24Hours: 30 * 60, // 30 minutos en segundos
  lessThan6Hours: 5 * 60, // 5 minutos en segundos
};

export const JITTER_PERCENTAGE = 0.1; // ±10%
export const MAX_RETRIES = 5;
export const BACKOFF_MULTIPLIER = 2;
export const STOP_AFTER_DEPARTURE_HOURS = 2;

/**
 * Calcula el intervalo de polling basado en el tiempo restante hasta la salida
 */
export function calculatePollingInterval(scheduledDeparture: Date, timezone = 'Europe/Madrid'): number {
  const now = DateTime.now().setZone(timezone);
  const departure = DateTime.fromJSDate(scheduledDeparture).setZone(timezone);
  const hoursUntilDeparture = departure.diff(now, 'hours').hours;

  if (hoursUntilDeparture >= 7 * 24) {
    return POLLING_INTERVALS.sevenDaysOrMore;
  } else if (hoursUntilDeparture >= 24) {
    return POLLING_INTERVALS.lessThanSevenDays;
  } else if (hoursUntilDeparture >= 6) {
    return POLLING_INTERVALS.lessThan24Hours;
  } else {
    return POLLING_INTERVALS.lessThan6Hours;
  }
}

/**
 * Aplica jitter al intervalo para evitar thundering herd
 */
export function applyJitter(interval: number, jitterPercentage = JITTER_PERCENTAGE): number {
  const jitterRange = interval * jitterPercentage;
  const jitter = (Math.random() - 0.5) * 2 * jitterRange;
  return Math.round(interval + jitter);
}

/**
 * Calcula el delay para exponential backoff en caso de error
 */
export function calculateBackoffDelay(retryCount: number, baseInterval: number): number {
  return Math.min(
    baseInterval * Math.pow(BACKOFF_MULTIPLIER, retryCount),
    baseInterval * 8 // máximo 8x el intervalo base
  );
}

/**
 * Determina si se debe detener el polling
 */
export function shouldStopPolling(
  scheduledDeparture: Date,
  status: string,
  timezone = 'Europe/Madrid'
): { shouldStop: boolean; reason?: string } {
  const now = DateTime.now().setZone(timezone);
  const departure = DateTime.fromJSDate(scheduledDeparture).setZone(timezone);
  const hoursAfterDeparture = now.diff(departure, 'hours').hours;

  // Parar si el vuelo ya salió o fue cancelado
  if (status === 'DEPARTED' || status === 'CANCELLED') {
    return { shouldStop: true, reason: status };
  }

  // Parar 2 horas después de la hora programada
  if (hoursAfterDeparture >= STOP_AFTER_DEPARTURE_HOURS) {
    return { shouldStop: true, reason: 'TIMEOUT' };
  }

  return { shouldStop: false };
}

/**
 * Calcula la próxima fecha de polling
 */
export function calculateNextPollDate(
  interval: number,
  retryCount = 0,
  timezone = 'Europe/Madrid'
): Date {
  const now = DateTime.now().setZone(timezone);
  let delay = interval;

  if (retryCount > 0) {
    delay = calculateBackoffDelay(retryCount, interval);
  } else {
    delay = applyJitter(interval);
  }

  return now.plus({ seconds: delay }).toJSDate();
}
