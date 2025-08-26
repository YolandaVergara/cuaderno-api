import { Request, Response, NextFunction } from 'express';

/**
 * Middleware simple de autenticación
 * En un entorno real, esto validaría JWT tokens o sesiones
 */
export function authenticateUser(req: Request, res: Response, next: NextFunction): void {
  // Para desarrollo, usar un userId por defecto o desde headers
  const userId = req.headers['x-user-id'] as string || 'default-user-id';
  
  if (!userId) {
    res.status(401).json({
      error: 'Authentication required',
      message: 'Please provide a valid user ID in x-user-id header',
    });
    return;
  }

  // Añadir userId al request para uso posterior
  (req as any).userId = userId;
  next();
}

/**
 * Middleware opcional de autenticación para rutas públicas
 */
export function optionalAuth(req: Request, res: Response, next: NextFunction): void {
  const userId = req.headers['x-user-id'] as string;
  
  if (userId) {
    (req as any).userId = userId;
  }
  
  next();
}
