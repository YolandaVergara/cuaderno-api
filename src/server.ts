import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Cargar variables de entorno
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Middlewares
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:4173',
    'https://cuaderno-donde-pise.vercel.app',
    /.*\.vercel\.app$/
  ],
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
  next();
});

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'Cuaderno Donde Pise API Server',
    status: 'running',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  });
});

// FlightAware proxy endpoint
app.post('/api/flightaware-proxy', async (req, res) => {
  console.log('🚀 FlightAware Proxy Request:', req.body);
  
  try {
    const { query, start, end, max_pages = '1' } = req.body;

    // Validar parámetros requeridos
    if (!query || !start || !end) {
      console.error('❌ Missing parameters:', { query: !!query, start: !!start, end: !!end });
      return res.status(400).json({ 
        error: 'Missing required parameters: query, start, end',
        received: { query: !!query, start: !!start, end: !!end }
      });
    }

    // Obtener la API key de las variables de entorno
    const apiKey = process.env.FLIGHTAWARE_API_KEY;
    console.log('🔑 API Key status:', apiKey ? 'Present' : 'Missing', apiKey ? `${apiKey.substring(0, 8)}...` : 'N/A');
    
    if (!apiKey || apiKey === 'demo') {
      console.error('❌ FlightAware API key not configured or still in demo mode');
      return res.status(401).json({ 
        error: 'FlightAware API key not configured or still in demo mode',
        hasKey: !!apiKey,
        isDemo: apiKey === 'demo'
      });
    }

    // Construir la URL de FlightAware con los parámetros
    const flightAwareUrl = new URL('https://aeroapi.flightaware.com/aeroapi/flights/search');
    flightAwareUrl.searchParams.append('query', query);
    flightAwareUrl.searchParams.append('start', start);
    flightAwareUrl.searchParams.append('end', end);
    flightAwareUrl.searchParams.append('max_pages', max_pages);

    console.log('🌐 FlightAware URL:', flightAwareUrl.toString());

    // Headers para la request a FlightAware
    const headers = {
      'x-apikey': apiKey,
      'Accept': 'application/json',
      'User-Agent': 'cuaderno-donde-pise/1.0'
    };

    console.log('📤 Requesting FlightAware API...');
    
    // Hacer la request a FlightAware
    const response = await fetch(flightAwareUrl.toString(), {
      method: 'GET',
      headers
    });

    console.log('📥 FlightAware Response:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FlightAware API Error:', {
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

    const data = await response.json() as any;
    console.log('✅ FlightAware Success:', {
      flights: data.flights?.length || 0,
      links: data.links ? Object.keys(data.links) : [],
      hasData: !!data
    });
    
    return res.status(200).json(data);

  } catch (error) {
    console.error('💥 Proxy Error:', error);
    
    if (error instanceof Error) {
      console.error('Error details:', {
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

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 FlightAware proxy: http://localhost:${PORT}/api/flightaware-proxy`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
