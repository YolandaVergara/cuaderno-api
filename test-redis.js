// Test simple para verificar que Redis/BullMQ funciona
const IORedis = require('ioredis');
const { Queue } = require('bullmq');

// Usar variable de entorno o local por defecto
const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

console.log(`🔗 Conectando a Redis: ${REDIS_URL}`);

async function testRedis() {
  let connection;
  let queue;
  
  try {
    // Crear conexión a Redis
    connection = new IORedis(REDIS_URL);
    
    // Test conexión básica
    console.log('📊 Testeando conexión básica...');
    const pong = await connection.ping();
    console.log(`✅ Ping response: ${pong}`);
    
    // Test BullMQ
    console.log('🎯 Testeando BullMQ...');
    queue = new Queue('test-queue', { connection });
    
    const job = await queue.add('test-job', { 
      message: 'Hello from test!',
      timestamp: new Date().toISOString()
    });
    
    console.log(`✅ Job creado con ID: ${job.id}`);
    
    // Limpiar
    await queue.close();
    await connection.quit();
    
    console.log('🎉 Todos los tests pasaron!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    
    // Cleanup en caso de error
    if (queue) await queue.close();
    if (connection) await connection.quit();
    
    process.exit(1);
  }
}

testRedis();
