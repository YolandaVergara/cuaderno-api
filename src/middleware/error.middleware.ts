import { Request, Response, NextFunction } from 'express';
import { logger } from '../config/logger';

/**
 * Middleware para manejo centralizado de errores
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    userId: (req as any).userId,
  });

  // No enviar detalles del error en producción
  const isDevelopment = process.env.NODE_ENV === 'development';

  res.status(500).json({
    error: 'Internal server error',
    ...(isDevelopment && {
      details: err.message,
      stack: err.stack,
    }),
  });
}

/**
 * Middleware para manejar rutas no encontradas
 */
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('Route not found', {
    url: req.url,
    method: req.method,
  });

  res.status(404).json({
    error: 'Route not found',
    path: req.url,
    method: req.method,
  });
}
