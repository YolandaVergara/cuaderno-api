import { Request, Response, NextFunction } from 'express';
import { verifyFirebaseToken } from '../config/firebase-admin';
import { logger } from '../config/logger';

/**
 * Middleware de autenticación real con Firebase
 * Valida tokens de Firebase y extrae el userId real
 */
export async function authenticateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Please provide a valid Bearer token in Authorization header',
      });
      return;
    }

    const idToken = authHeader.replace('Bearer ', '');
    
    if (!idToken) {
      res.status(401).json({
        error: 'Authentication required',
        message: 'Bearer token is empty',
      });
      return;
    }

    // Verificar token con Firebase
    const decodedToken = await verifyFirebaseToken(idToken);
    
    // Añadir información del usuario al request
    (req as any).userId = decodedToken.uid;
    (req as any).userEmail = decodedToken.email;
    (req as any).firebaseUser = decodedToken;

    logger.debug('User authenticated successfully', {
      uid: decodedToken.uid,
      email: decodedToken.email,
      route: req.path
    });

    next();
  } catch (error) {
    logger.warn('Authentication failed', { 
      error: error instanceof Error ? error.message : 'Unknown error',
      route: req.path,
      userAgent: req.headers['user-agent']
    });

    res.status(401).json({
      error: 'Authentication failed',
      message: 'Invalid or expired token',
    });
  }
}

/**
 * Middleware opcional de autenticación para rutas públicas
 * Si hay token, lo valida, pero no bloquea si no hay token
 */
export async function optionalAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const idToken = authHeader.replace('Bearer ', '');
      
      if (idToken) {
        try {
          const decodedToken = await verifyFirebaseToken(idToken);
          
          // Añadir información del usuario al request si el token es válido
          (req as any).userId = decodedToken.uid;
          (req as any).userEmail = decodedToken.email;
          (req as any).firebaseUser = decodedToken;

          logger.debug('Optional auth: User authenticated', {
            uid: decodedToken.uid,
            email: decodedToken.email,
            route: req.path
          });
        } catch (tokenError) {
          // Token inválido, pero como es opcional, continuamos sin usuario
          logger.debug('Optional auth: Invalid token, continuing without auth', {
            route: req.path
          });
        }
      }
    }
    
    next();
  } catch (error) {
    // En auth opcional, nunca bloqueamos por errores
    logger.debug('Optional auth: Error occurred, continuing without auth', {
      error: error instanceof Error ? error.message : 'Unknown error',
      route: req.path
    });
    next();
  }
}

/**
 * Middleware legacy para compatibilidad durante la migración
 * TODO: Eliminar una vez migrada toda la aplicación
 */
export function legacyAuth(req: Request, res: Response, next: NextFunction): void {
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
