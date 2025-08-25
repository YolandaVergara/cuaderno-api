import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;
const FLIGHTAWARE_API_KEY = process.env.FLIGHTAWARE_API_KEY;

console.log('🔧 Server starting:', {
  port: PORT,
  hasApiKey: !!FLIGHTAWARE_API_KEY,
  environment: process.env.NODE_ENV || 'development'
});

// Middleware
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    port: PORT,
    hasApiKey: !!FLIGHTAWARE_API_KEY 
  });
});

// FlightAware API endpoint
app.post('/api/flight', async (req, res) => {
  console.log('📡 Flight request:', req.body);

  if (!FLIGHTAWARE_API_KEY) {
    return res.status(500).json({
      error: 'FlightAware API key not configured'
    });
  }

  try {
    const { flightNumber, startDate, endDate } = req.body;

    if (!flightNumber || !startDate) {
      return res.status(400).json({
        error: 'Missing required parameters: flightNumber and startDate'
      });
    }

    const url = `https://aeroapi.flightaware.com/aeroapi/flights/search?query=${encodeURIComponent(flightNumber)}&start=${startDate}&end=${endDate || startDate}&max_pages=1`;
    
    const response = await fetch(url, {
      headers: {
        'x-apikey': FLIGHTAWARE_API_KEY,
        'Accept': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({
        error: `FlightAware API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    res.json(data);

  } catch (error) {
    console.error('❌ Error:', error);
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
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log(`🔗 Flight: http://localhost:${PORT}/api/flight`);
});

export default app;
