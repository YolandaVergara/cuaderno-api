import { Router } from 'express';
import { exec } from 'child_process';
import { promisify } from 'util';
import { FlightController } from '../controllers/flight.controller';
import { validateRequest } from '../middleware/validation.middleware';
import { authenticateUser } from '../middleware/auth.middleware';
import {
  RegisterFlightTrackingSchema,
  CancelTrackingSchema,
} from '../types/validation';

const execAsync = promisify(exec);
const router = Router();
const flightController = new FlightController();

// TEMPORAL: Endpoint público para arreglar la base de datos
router.post('/fix-db', (req: any, res: any) => flightController.fixDatabase(req, res));

/**

// Aplicar autenticación a todas las rutas
router.use(authenticateUser);

/**
 * GET /api/flight/by-date
 * Busca vuelos por número de vuelo y fecha (usado por el frontend)
 * Formato de query params: ?ident=FLIGHT_NUMBER&date=YYYY-MM-DD
 */
router.get('/by-date', (req: any, res: any) => flightController.searchFlightByDate(req, res));

/**
 * GET /api/flight/trackings
 * Obtiene todos los seguimientos activos del usuario
 * IMPORTANTE: Esta ruta específica debe ir ANTES que /:flightId
 */
router.get('/trackings', (req: any, res: any) => flightController.getUserFlightTrackings(req, res));

/**
 * GET /api/flight/:flightId
 * Obtiene información completa de un vuelo específico
 */
router.get('/:flightId', (req: any, res: any) => flightController.getFlightInfo(req, res));

/**
 * POST /api/flight/:flightId/follow
 * Registra un vuelo para seguimiento
 */
router.post(
  '/:flightId/follow',
  validateRequest(RegisterFlightTrackingSchema),
  (req: any, res: any) => flightController.registerFlightTracking(req, res)
);

/**
 * DELETE /api/flight/:flightId/follow
 * Cancela el seguimiento de un vuelo
 */
router.delete(
  '/:flightId/follow',
  validateRequest(CancelTrackingSchema),
  (req: any, res: any) => flightController.cancelFlightTracking(req, res)
);

// TEMPORAL: Endpoint público para forzar migración (sin autenticación)
router.post('/force-migration-public', async (req, res) => {
  try {
    console.log('🚀 Forzando migración de base de datos...');
    
    // Ejecutar db push
    console.log('🗄️ Ejecutando db push...');
    const pushResult = await execAsync('npx prisma db push --accept-data-loss');
    console.log('Push result:', pushResult.stdout);
    
    res.json({
      success: true,
      message: 'Migration completed successfully',
      output: pushResult.stdout
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

// TEMPORAL: Endpoint para forzar migración
router.post('/force-migration', async (req, res) => {
  try {
    console.log('🚀 Forzando migración de base de datos...');
    
    // Ejecutar db push
    console.log('🗄️ Ejecutando db push...');
    const pushResult = await execAsync('npx prisma db push --accept-data-loss');
    console.log('Push result:', pushResult.stdout);
    
    res.json({
      success: true,
      message: 'Migration completed successfully',
      output: pushResult.stdout
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

export { router as flightRoutes };
