# 🔥 CONFIGURACIÓN DE FIREBASE SERVICE ACCOUNT

## 📋 **PASOS PARA OBTENER CREDENCIALES:**

### 1. **Ir a Firebase Console**
   - Abre: https://console.firebase.google.com/
   - Selecciona tu proyecto: `cuaderno-donde-pise`

### 2. **Navegar a Service Accounts**
   - Ve a **Project Settings** (⚙️ icono)
   - Pestaña **Service accounts**

### 3. **Generar nueva clave privada**
   - Haz clic en **"Generate new private key"**
   - Se descargará un archivo JSON

### 4. **Extraer datos del JSON**
   El archivo descargado tendrá esta estructura:
   ```json
   {
     "type": "service_account",
     "project_id": "cuaderno-donde-pise",
     "private_key_id": "...",
     "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
     "client_email": "firebase-adminsdk-xxxxx@cuaderno-donde-pise.iam.gserviceaccount.com",
     "client_id": "...",
     "auth_uri": "https://accounts.google.com/o/oauth2/auth",
     "token_uri": "https://oauth2.googleapis.com/token",
     "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
     "client_x509_cert_url": "..."
   }
   ```

### 5. **Actualizar .env local (para testing)**
   ```bash
   FIREBASE_PROJECT_ID="cuaderno-donde-pise"
   FIREBASE_CLIENT_EMAIL="firebase-adminsdk-xxxxx@cuaderno-donde-pise.iam.gserviceaccount.com"
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg...\n-----END PRIVATE KEY-----\n"
   ```

### 6. **Para Railway (producción)**
   Añadir las mismas variables en Railway dashboard:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_CLIENT_EMAIL` 
   - `FIREBASE_PRIVATE_KEY`

## ⚠️ **IMPORTANTE:**
- **NO** subas el archivo JSON al repositorio
- Usa solo las 3 variables de entorno mencionadas
- El `private_key` debe incluir `\n` para los saltos de línea

## 🧪 **PARA TESTING LOCAL:**
Una vez configuradas las variables, podemos probar:
```bash
curl -H "Authorization: Bearer FIREBASE_ID_TOKEN" http://localhost:3000/api/debug/jobs/stats
```

¿Quieres que te ayude a obtener estas credenciales o prefieres hacerlo tú?
