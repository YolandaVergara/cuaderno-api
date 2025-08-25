import express from 'express';
import cors from 'cors';


const app = express();

// Railway provides PORT via environment variable
const PORT = process.env.PORT || 3000;
const FLIGHTAWARE_API_KEY = process.env.FLIGHTAWARE_API_KEY;

console.log('🔧 Configuration:', {
  port: PORT,
  hasApiKey: !!FLIGHTAWARE_API_KEY,
  environment: process.env.NODE_ENV || 'development'
});

// Middleware
app.use(cors({
  origin: true, // Allow all origins for now
  credentials: true
}));
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    port: PORT,
    hasApiKey: !!FLIGHTAWARE_API_KEY 
  });
});

// FlightAware proxy endpoint
app.post('/api/flight', async (req, res) => {
  console.log('📡 FlightAware request received:', req.body);

  if (!FLIGHTAWARE_API_KEY) {
    console.error('❌ No FlightAware API key configured');
    return res.status(500).json({
      error: 'FlightAware API key not configured',
      code: 'MISSING_API_KEY'
    });
  }

  try {
    const { flightNumber, startDate, endDate } = req.body;

    if (!flightNumber || !startDate) {
      return res.status(400).json({
        error: 'Missing required parameters: flightNumber and startDate'
      });
    }

    console.log('🔍 Searching for flight:', { flightNumber, startDate, endDate });

    const url = `https://aeroapi.flightaware.com/aeroapi/flights/search?query=${encodeURIComponent(flightNumber)}&start=${startDate}&end=${endDate || startDate}&max_pages=1`;
    
    console.log('🌐 FlightAware API URL:', url);

    const response = await fetch(url, {
      headers: {
        'x-apikey': FLIGHTAWARE_API_KEY,
        'Accept': 'application/json'
      }
    });

    console.log('📡 FlightAware response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ FlightAware API error:', response.status, errorText);
      return res.status(response.status).json({
        error: `FlightAware API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    console.log('✅ FlightAware data received:', {
      flightCount: data.flights?.length || 0,
      hasFlights: !!data.flights
    });

    res.json(data);

  } catch (error) {
    console.error('❌ Server error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Cuaderno Donde Pisé API',
    endpoints: {
      health: '/health',
      flight: '/api/flight'
    },
    version: '1.0.0'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🔗 FlightAware proxy: http://localhost:${PORT}/api/flight`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
