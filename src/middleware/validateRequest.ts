import { AnyZodObject } from "zod";
import { Request, Response, NextFunction } from "express";

export function validateRequest(schema: AnyZodObject) {
  return (req: Request & { validated?: any }, res: Response, next: NextFunction) => {
    try {
      const parsed = schema.parse({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      req.validated = parsed;
      return next();
    } catch (err: any) {
      return res.status(400).json({ error: "Validation error", details: err.errors ?? String(err) });
    }
  };
}
