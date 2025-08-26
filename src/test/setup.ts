import { prisma } from '../config/database';
import { redis } from '../config/redis';

// Setup global para tests
beforeAll(async () => {
  // Configurar base de datos de test
  process.env.NODE_ENV = 'test';
});

afterAll(async () => {
  // Limpiar y cerrar conexiones
  await prisma.$disconnect();
  await redis.disconnect();
});

beforeEach(async () => {
  // Limpiar datos de test antes de cada test
  await prisma.notification.deleteMany();
  await prisma.flightTracking.deleteMany();
  await prisma.user.deleteMany();
});
