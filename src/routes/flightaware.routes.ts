import { Router, Request, Response } from 'express';
import { config } from '../config/config';
import { logger } from '../config/logger';

const router = Router();

/**
 * POST /api/flightaware-proxy
 * Proxy directo a FlightAware API (para compatibilidad con frontend existente)
 */
router.post('/flightaware-proxy', async (req: Request, res: Response) => {
  logger.info('FlightAware Proxy Request', { body: req.body });
  
  try {
    const { query, start, end, max_pages = '1' } = req.body;

    // Validar parámetros requeridos
    if (!query || !start || !end) {
      logger.error('Missing parameters', { query: !!query, start: !!start, end: !!end });
      return res.status(400).json({ 
        error: 'Missing required parameters: query, start, end',
        received: { query: !!query, start: !!start, end: !!end }
      });
    }

    // Obtener la API key
    const apiKey = config.flightAware?.apiKey || config.flightProvider.apiKey;
    logger.info('API Key status', { 
      hasKey: !!apiKey, 
      source: config.flightAware?.apiKey ? 'flightAware.apiKey' : 'flightProvider.apiKey',
      keyPrefix: apiKey ? `${apiKey.substring(0, 8)}...` : 'N/A' 
    });
    
    if (!apiKey || apiKey === 'demo' || apiKey.includes('your_')) {
      logger.error('FlightAware API key not configured or still in demo mode');
      return res.status(401).json({ 
        error: 'FlightAware API key not configured or still in demo mode',
        hasKey: !!apiKey,
        isDemo: apiKey === 'demo' || apiKey.includes('your_')
      });
    }

    // Construir la URL de FlightAware con los parámetros
    const flightAwareUrl = new URL('https://aeroapi.flightaware.com/aeroapi/flights/search');
    flightAwareUrl.searchParams.append('query', query);
    flightAwareUrl.searchParams.append('start', start);
    flightAwareUrl.searchParams.append('end', end);
    flightAwareUrl.searchParams.append('max_pages', max_pages);

    logger.info('FlightAware URL', { url: flightAwareUrl.toString() });

    // Headers para la request a FlightAware
    const headers = {
      'x-apikey': apiKey,
      'Accept': 'application/json',
      'User-Agent': 'cuaderno-donde-pise/1.0'
    };

    logger.info('Requesting FlightAware API...');
    
    // Hacer la request a FlightAware
    const response = await fetch(flightAwareUrl.toString(), {
      method: 'GET',
      headers
    });

    logger.info('FlightAware Response', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Error response not readable');
      logger.error('FlightAware API Error', {
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
      
      return res.status(response.status).json({
        error: 'FlightAware API request failed',
        status: response.status,
        statusText: response.statusText,
        body: errorText
      });
    }

    const data = await response.json();
    logger.info('FlightAware Success', {
      flights: data.flights?.length || 0,
      links: data.links ? Object.keys(data.links) : [],
      hasData: !!data
    });
    
    return res.status(200).json(data);

  } catch (error) {
    logger.error('Proxy Error', { error });
    
    if (error instanceof Error) {
      logger.error('Error details', {
        name: error.name,
        message: error.message,
        stack: error.stack
      });
      
      return res.status(500).json({
        error: 'Internal server error',
        message: error.message,
        name: error.name
      });
    }
    
    return res.status(500).json({
      error: 'Unknown internal server error'
    });
  }
});

export { router as flightAwareRoutes };
