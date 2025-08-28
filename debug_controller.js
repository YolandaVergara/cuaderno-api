const fs = require('fs');

// Leer archivo
const content = fs.readFileSync('src/controllers/notification.controller.ts', 'utf8');

// Crear versión ultra simple del método getUserNotifications
const debugMethod = `  async getUserNotifications(req: any, res: any): Promise<void> {
    try {
      console.log("🔍 DEBUG: Method called");
      console.log("🔍 DEBUG: req exists:", !!req);
      console.log("🔍 DEBUG: req.query exists:", !!req?.query);
      
      res.json({
        message: 'Debug: Method working',
        requestExists: !!req,
        queryExists: !!req?.query,
        keys: req ? Object.keys(req) : 'req is null'
      });
    } catch (error) {
      console.error("🔍 DEBUG: Error in method:", error);
      res.status(500).json({
        error: 'Debug error',
        details: error.message
      });
    }
  }`;

// Buscar y reemplazar el método problemático
const regex = /async getUserNotifications\([^{]*\{[\s\S]*?^  \}/gm;
const fixed = content.replace(regex, debugMethod);

// Escribir archivo
fs.writeFileSync('src/controllers/notification.controller.ts', fixed);
console.log('✅ Debug method replaced');
