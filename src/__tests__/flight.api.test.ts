import request from 'supertest';
import { app } from '../server';
import { prisma } from '../config/database';

describe('Flight API Endpoints', () => {
  const testUserId = 'test-user-id';
  
  beforeEach(async () => {
    // Limpiar datos de test
    await prisma.notification.deleteMany();
    await prisma.flightTracking.deleteMany();
    await prisma.user.deleteMany();
    
    // Crear usuario de test
    await prisma.user.create({
      data: {
        id: testUserId,
        email: 'test@example.com',
        name: 'Test User',
      },
    });
  });

  describe('POST /api/flights/track', () => {
    it('should register a new flight tracking', async () => {
      const flightData = {
        flightId: 'AA123-2024-08-26',
        airline: 'American Airlines',
        flightNumber: 'AA123',
        scheduledDeparture: '2024-08-26T10:30:00Z',
        origin: 'JFK',
        destination: 'LAX',
      };

      const response = await request(app)
        .post('/api/flights/track')
        .set('x-user-id', testUserId)
        .send(flightData)
        .expect(201);

      expect(response.body.message).toBe('Flight tracking registered successfully');
      expect(response.body.data.flightId).toBe(flightData.flightId);
      expect(response.body.data.status).toBe('SCHEDULED');
    });

    it('should return 400 for invalid flight data', async () => {
      const invalidData = {
        flightId: '',
        airline: 'American Airlines',
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/flights/track')
        .set('x-user-id', testUserId)
        .send(invalidData)
        .expect(400);

      expect(response.body.error).toBe('Validation failed');
    });

    it('should return 401 without authentication', async () => {
      const flightData = {
        flightId: 'AA123-2024-08-26',
        airline: 'American Airlines',
        flightNumber: 'AA123',
        scheduledDeparture: '2024-08-26T10:30:00Z',
        origin: 'JFK',
        destination: 'LAX',
      };

      await request(app)
        .post('/api/flights/track')
        .send(flightData)
        .expect(401);
    });
  });

  describe('GET /api/flights/trackings', () => {
    beforeEach(async () => {
      // Crear algunos seguimientos de prueba
      await prisma.flightTracking.createMany({
        data: [
          {
            userId: testUserId,
            flightId: 'AA123-2024-08-26',
            airline: 'American Airlines',
            flightNumber: 'AA123',
            scheduledDeparture: new Date('2024-08-26T10:30:00Z'),
            origin: 'JFK',
            destination: 'LAX',
            status: 'SCHEDULED',
            pollInterval: 3600,
            nextPollAt: new Date(),
          },
          {
            userId: testUserId,
            flightId: 'UA456-2024-08-27',
            airline: 'United Airlines',
            flightNumber: 'UA456',
            scheduledDeparture: new Date('2024-08-27T14:15:00Z'),
            origin: 'ORD',
            destination: 'SFO',
            status: 'DELAYED',
            delay: 30,
            pollInterval: 1800,
            nextPollAt: new Date(),
          },
        ],
      });
    });

    it('should return user flight trackings', async () => {
      const response = await request(app)
        .get('/api/flights/trackings')
        .set('x-user-id', testUserId)
        .expect(200);

      expect(response.body.message).toBe('Flight trackings retrieved successfully');
      expect(response.body.data).toHaveLength(2);
      expect(response.body.count).toBe(2);
      
      const flight1 = response.body.data.find((f: any) => f.flightId === 'AA123-2024-08-26');
      expect(flight1.status).toBe('SCHEDULED');
      
      const flight2 = response.body.data.find((f: any) => f.flightId === 'UA456-2024-08-27');
      expect(flight2.status).toBe('DELAYED');
      expect(flight2.delay).toBe(30);
    });

    it('should return empty array for user with no trackings', async () => {
      const response = await request(app)
        .get('/api/flights/trackings')
        .set('x-user-id', 'another-user-id')
        .expect(200);

      expect(response.body.data).toHaveLength(0);
      expect(response.body.count).toBe(0);
    });
  });

  describe('DELETE /api/flights/trackings/:trackingId', () => {
    let trackingId: string;

    beforeEach(async () => {
      const tracking = await prisma.flightTracking.create({
        data: {
          userId: testUserId,
          flightId: 'AA123-2024-08-26',
          airline: 'American Airlines',
          flightNumber: 'AA123',
          scheduledDeparture: new Date('2024-08-26T10:30:00Z'),
          origin: 'JFK',
          destination: 'LAX',
          status: 'SCHEDULED',
          pollInterval: 3600,
          nextPollAt: new Date(),
        },
      });
      trackingId = tracking.id;
    });

    it('should cancel flight tracking', async () => {
      const response = await request(app)
        .delete(`/api/flights/trackings/${trackingId}`)
        .set('x-user-id', testUserId)
        .expect(200);

      expect(response.body.message).toBe('Flight tracking cancelled successfully');
      expect(response.body.trackingId).toBe(trackingId);

      // Verificar que se marcó como inactivo
      const tracking = await prisma.flightTracking.findUnique({
        where: { id: trackingId },
      });
      expect(tracking?.isActive).toBe(false);
      expect(tracking?.stopReason).toBe('USER_CANCELLED');
    });

    it('should return 404 for non-existent tracking', async () => {
      const response = await request(app)
        .delete('/api/flights/trackings/non-existent-id')
        .set('x-user-id', testUserId)
        .expect(404);

      expect(response.body.error).toBe('Flight tracking not found or already cancelled');
    });

    it('should return 404 when trying to cancel another user\'s tracking', async () => {
      const response = await request(app)
        .delete(`/api/flights/trackings/${trackingId}`)
        .set('x-user-id', 'another-user-id')
        .expect(404);

      expect(response.body.error).toBe('Flight tracking not found or already cancelled');
    });
  });
});
