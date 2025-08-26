import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '../config/logger';

export interface ValidatedRequest<T = any> extends Request {
  validated: T;
}

/**
 * Middleware para validar requests usando esquemas Zod
 */
export function validateRequest<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const validated = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });

      (req as ValidatedRequest<T>).validated = validated;
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map(err => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code,
        }));

        logger.warn('Request validation failed', {
          url: req.url,
          method: req.method,
          errors,
        });

        res.status(400).json({
          error: 'Validation failed',
          details: errors,
        });
        return;
      }

      logger.error('Unexpected validation error', { error });
      res.status(500).json({
        error: 'Internal server error',
      });
    }
  };
}
