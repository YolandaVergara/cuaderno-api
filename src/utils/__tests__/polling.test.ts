import { describe, it, expect, beforeEach } from '@jest/globals';
import { calculatePollingInterval, applyJitter, shouldStopPolling, calculateNextPollDate } from '../polling';

describe('Polling Utils', () => {
  describe('calculatePollingInterval', () => {
    it('should return 6 hours for flights 7+ days away', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 8);
      
      const interval = calculatePollingInterval(futureDate);
      expect(interval).toBe(6 * 60 * 60); // 6 horas en segundos
    });

    it('should return 1 hour for flights less than 7 days but more than 1 day away', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 2);
      
      const interval = calculatePollingInterval(futureDate);
      expect(interval).toBe(60 * 60); // 1 hora en segundos
    });

    it('should return 30 minutes for flights less than 24 hours but more than 6 hours away', () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 8);
      
      const interval = calculatePollingInterval(futureDate);
      expect(interval).toBe(30 * 60); // 30 minutos en segundos
    });

    it('should return 5 minutes for flights less than 6 hours away', () => {
      const futureDate = new Date();
      futureDate.setHours(futureDate.getHours() + 2);
      
      const interval = calculatePollingInterval(futureDate);
      expect(interval).toBe(5 * 60); // 5 minutos en segundos
    });
  });

  describe('applyJitter', () => {
    it('should apply jitter within the expected range', () => {
      const baseInterval = 3600; // 1 hora
      const jitterPercentage = 0.1; // 10%
      
      const results = [];
      for (let i = 0; i < 100; i++) {
        results.push(applyJitter(baseInterval, jitterPercentage));
      }
      
      const min = Math.min(...results);
      const max = Math.max(...results);
      
      // Debería estar dentro del rango ±10%
      expect(min).toBeGreaterThanOrEqual(baseInterval * 0.9);
      expect(max).toBeLessThanOrEqual(baseInterval * 1.1);
    });
  });

  describe('shouldStopPolling', () => {
    it('should stop polling for departed flights', () => {
      const scheduledDeparture = new Date();
      const result = shouldStopPolling(scheduledDeparture, 'DEPARTED');
      
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('DEPARTED');
    });

    it('should stop polling for cancelled flights', () => {
      const scheduledDeparture = new Date();
      const result = shouldStopPolling(scheduledDeparture, 'CANCELLED');
      
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('CANCELLED');
    });

    it('should stop polling 2 hours after scheduled departure', () => {
      const scheduledDeparture = new Date();
      scheduledDeparture.setHours(scheduledDeparture.getHours() - 3); // 3 horas atrás
      
      const result = shouldStopPolling(scheduledDeparture, 'SCHEDULED');
      
      expect(result.shouldStop).toBe(true);
      expect(result.reason).toBe('TIMEOUT');
    });

    it('should continue polling for scheduled flights before timeout', () => {
      const scheduledDeparture = new Date();
      scheduledDeparture.setHours(scheduledDeparture.getHours() + 1); // 1 hora en el futuro
      
      const result = shouldStopPolling(scheduledDeparture, 'SCHEDULED');
      
      expect(result.shouldStop).toBe(false);
    });
  });

  describe('calculateNextPollDate', () => {
    it('should calculate next poll date with interval', () => {
      const interval = 3600; // 1 hora
      const nextPoll = calculateNextPollDate(interval);
      
      const now = new Date();
      const diffInSeconds = (nextPoll.getTime() - now.getTime()) / 1000;
      
      // Debería estar cerca de 1 hora, considerando el jitter
      expect(diffInSeconds).toBeGreaterThan(3240); // 54 minutos (90% de 1 hora)
      expect(diffInSeconds).toBeLessThan(3960); // 66 minutos (110% de 1 hora)
    });

    it('should apply backoff delay for retries', () => {
      const baseInterval = 300; // 5 minutos
      const retryCount = 2;
      const nextPoll = calculateNextPollDate(baseInterval, retryCount);
      
      const now = new Date();
      const diffInSeconds = (nextPoll.getTime() - now.getTime()) / 1000;
      
      // Con exponential backoff: 300 * 2^2 = 1200 segundos
      expect(diffInSeconds).toBeGreaterThan(1000);
      expect(diffInSeconds).toBeLessThan(1400);
    });
  });
});
