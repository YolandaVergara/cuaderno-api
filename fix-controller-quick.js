const fs = require('fs');

// Leer el archivo actual
const content = fs.readFileSync('src/controllers/notification.controller.ts', 'utf8');

// Reemplazar el bloque problemático con mejor error handling
const fixed = content.replace(
  /try \{\s*console\.log\("DEBUG: req object:", Object\.keys\(req \|\| \{\}\)\);\s*const userId = \(req as any\)\.userId;\s*console\.log\("DEBUG: userId:", userId\);\s*const queryData = \(req as any\)\.validated\?\.query \|\| req\.query \|\| \{\};\s*const page = queryData\.page \? parseInt\(queryData\.page, 10\) : 1;\s*const limit = queryData\.limit \? parseInt\(queryData\.limit, 10\) : 20;\s*const unreadOnly = queryData\.unreadOnly === 'true' \|\| queryData\.unreadOnly === true;/,
  `try {
      console.log("DEBUG: req object:", Object.keys(req || {}));
      console.log("DEBUG: req.query:", req.query);
      
      const userId = (req as any).userId;
      console.log("DEBUG: userId:", userId);
      
      if (!userId) {
        throw new Error("User ID not found in request");
      }
      
      const queryData = req.query || {};
      const page = queryData.page ? parseInt(queryData.page as string, 10) : 1;
      const limit = queryData.limit ? parseInt(queryData.limit as string, 10) : 20;
      const unreadOnly = queryData.unreadOnly === 'true' || queryData.unreadOnly === true;`
);

// Escribir el archivo corregido
fs.writeFileSync('src/controllers/notification.controller.ts', fixed);
console.log('✅ Controller fixed with better error handling');
