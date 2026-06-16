# Choe-OS Discord Notification Microservice

Este es un microservicio de notificaciones privadas para el sistema **Choe-OS**. Su único propósito es recibir peticiones POST a través de su API Express y enviar Mensajes Directos (DMs) a los usuarios configurados (Fer y Zoe) usando la librería `Discord.js` (v14+).

---

## 🛠️ Requisitos previos

- **Node.js** v16.9.0 o superior.
- **npm** (gestor de paquetes de Node.js).
- Un bot de Discord configurado en el Portal de Desarrolladores de Discord con los siguientes privilegios y permisos habilitados:
  - **Gateway Intents**: Debes activar **Guild Members Intent** y **Message Content Intent** en la pestaña "Bot" de tu aplicación de Discord en el Developer Portal.

---

## 🚀 Instalación y Configuración

1. **Instalar Dependencias**:
   Instala los paquetes necesarios definidos en el `package.json`:
   ```bash
   npm install
   ```

2. **Variables de Entorno**:
   Copia el archivo de ejemplo `.env.example` como `.env`:
   ```bash
   cp .env.example .env
   ```
   Abre el archivo `.env` recién creado y completa los valores correspondientes:
   - `DISCORD_BOT_TOKEN`: El token secreto de tu bot de Discord.
   - `FER_DISCORD_ID`: El ID numérico único de Discord de Fer.
   - `ZOE_DISCORD_ID`: El ID numérico único de Discord de Zoe.
   - `PORT`: El puerto en el cual el servidor Express escuchará las peticiones (por defecto `3000`).

---

## 🏃 Cómo iniciar el proyecto

### Modo Producción
Para iniciar el servidor con Node directamente:
```bash
npm start
```

### Modo Desarrollo
Para iniciar el servidor en modo desarrollo (utilizando `nodemon` para que se reinicie automáticamente con cada cambio):
```bash
npm run dev
```

Una vez levantado, deberías ver mensajes similares a estos en la consola:
```text
🚀 Servidor Express escuchando en http://localhost:3000
🤖 Bot de Discord conectado exitosamente como NombreDeTuBot#0000
```

---

## 🔌 API Endpoints (REST)

El backend principal de Choe-OS puede comunicarse con los siguientes endpoints enviando cabeceras `Content-Type: application/json`:

### 1. Enviar DM a Fer
- **URL**: `POST /notify/fer`
- **Body**:
  ```json
  {
    "action": "zoe_redeem_voucher",
    "message": "Zoe ha canjeado un vale: 'Cena romántica'."
  }
  ```
- **Respuestas**:
  - `200 OK`: Mensaje enviado exitosamente.
  - `403 Forbidden`: El bot no comparte servidor con Fer o tiene los DMs cerrados.
  - `404 Not Found`: El ID configurado de Fer es incorrecto.

### 2. Enviar DM a Zoe
- **URL**: `POST /notify/zoe`
- **Body**:
  ```json
  {
    "action": "fer_gift_coins",
    "message": "Fer te ha regalado 50 monedas!"
  }
  ```
- **Respuestas**:
  - `200 OK`: Mensaje enviado exitosamente.
  - `403 Forbidden`: El bot no comparte servidor con Zoe o tiene los DMs cerrados.
  - `404 Not Found`: El ID configurado de Zoe es incorrecto.

### 3. Prueba de Webhooks
- **URL**: `POST /test-webhooks`
- **Acción**: Envía un mensaje de prueba simultáneo tanto a Fer como a Zoe.
- **Mensaje enviado**: `✅ Prueba de webhook exitosa. Choe-OS está conectado correctamente.`
- **Respuestas**:
  - `200 OK`: Mensaje enviado correctamente a ambos.
  - `403/404`: Si hay algún error con alguno de los dos IDs o configuraciones de privacidad de Discord.
