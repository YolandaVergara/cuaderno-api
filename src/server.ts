import express from 'express';
import cors from 'cors';

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Log inicial
console.log(`🚀 Iniciando servidor en puerto ${PORT}`);
console.log(`📍 Variables: NODE_ENV=${process.env.NODE_ENV}, FLIGHTAWARE_API_KEY=${process.env.FLIGHTAWARE_API_KEY ? 'PRESENTE' : 'FALTANTE'}`);

// Middleware básico
app.use(cors());
app.use(express.json());

// Health check simplificado
app.get('/health', (req, res) => {
  console.log('�� Health check solicitado');
  res.status(200).json({ 
    status: 'OK',
    timestamp: new Date().toISOString(),
    port: PORT,
    env: process.env.NODE_ENV || 'development'
  });
});

// Endpoint raíz
app.get('/', (req, res) => {
  console.log('�� Root endpoint solicitado');
  res.status(200).json({
    message: 'Cuaderno Donde Pisé API',
    status: 'running',
    endpoints: ['/health', '/api/flight']
  });
});

// FlightAware endpoint
app.post('/api/flight', async (req, res) => {
  console.log('✈️ Flight endpoint solicitado:', req.body);
  
  const API_KEY = process.env.FLIGHTAWARE_API_KEY;
  
  if (!API_KEY) {
    console.error('❌ API Key faltante');
    return res.status(500).json({
      error: 'FlightAware API key not configured',
      details: 'Configure FLIGHTAWARE_API_KEY environment variable'
    });
  }

  try {
    const { flightNumber, startDate, endDate } = req.body;
    
    if (!flightNumber || !startDate) {
      console.error('❌ Parámetros faltantes:', { flightNumber, startDate });
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['flightNumber', 'startDate']
      });
    }

    const url = `https://aeroapi.flightaware.com/aeroapi/flights/search?query=${encodeURIComponent(flightNumber)}&start=${startDate}&end=${endDate || startDate}&max_pages=1`;
    
    console.log('🌐 Llamando a FlightAware:', url);
    
    const response = await fetch(url, {
      headers: {
        'x-apikey': API_KEY,
        'Accept': 'application/json'
      }
    });

    console.log('📡 Respuesta FlightAware:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('❌ Error FlightAware:', response.status, errorText);
      return res.status(response.status).json({
        error: 'FlightAware API error',
        status: response.status,
        details: errorText
      });
    }

    const data = await response.json();
    console.log('✅ Datos obtenidos, vuelos:', data.flights?.length || 0);
    
    res.status(200).json(data);

  } catch (error) {
    console.error('💥 Error servidor:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Error handling
app.use((err: any, req: any, res: any, next: any) => {
  console.error('💥 Error middleware:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  console.log('❓ 404:', req.originalUrl);
  res.status(404).json({ error: 'Endpoint not found' });
});

// Iniciar servidor
app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Servidor corriendo en puerto ${PORT}`);
  console.log(`📍 Health: http://localhost:${PORT}/health`);
  console.log(`✈️ Flight: http://localhost:${PORT}/api/flight`);
});

export default app;
