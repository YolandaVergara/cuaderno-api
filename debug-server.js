const express = require('express');
const app = express();

console.log('=== DEBUG INFO ===');
console.log('PORT env var:', process.env.PORT);
console.log('All env vars:', Object.keys(process.env).filter(k => k.includes('PORT') || k.includes('RAILWAY')));

const PORT = process.env.PORT || 3000;
console.log('Using PORT:', PORT);

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    port: PORT,
    env_port: process.env.PORT,
    time: new Date().toISOString() 
  });
});

app.get('/', (req, res) => {
  res.json({ message: 'Server is running!' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server successfully started on 0.0.0.0:${PORT}`);
  console.log('Server address:', server.address());
});

server.on('error', (err) => {
  console.error('❌ Server error:', err);
});
