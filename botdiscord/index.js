const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');
require('dotenv').config();

// Inicialización de Express
const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

// Inicialización del Cliente de Discord
// Se configuran los intents y partials requeridos para el envío de DMs
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

let isBotReady = false;

// Evento cuando el bot está listo
client.once('ready', () => {
  console.log(`🤖 Bot de Discord conectado exitosamente como ${client.user.tag}`);
  isBotReady = true;
});

// Capturar errores del cliente de Discord para evitar caídas del proceso
client.on('error', (error) => {
  console.error('❌ Error en el cliente de Discord:', error);
});

/**
 * Función auxiliar para enviar un mensaje directo (DM) a un usuario por su ID
 * @param {string} userId - ID de Discord del destinatario
 * @param {string} messageContent - Contenido del mensaje a enviar
 */
async function sendDM(userId, messageContent) {
  if (!userId) {
    throw new Error('MISSING_USER_ID');
  }
  const user = await client.users.fetch(userId);
  await user.send(messageContent);
}

/**
 * Manejador centralizado de errores de la API de Discord
 * @param {Error} error - Objeto de error capturado
 * @param {express.Response} res - Objeto respuesta de Express
 */
function handleDiscordError(error, res) {
  // Manejo de restricciones de privacidad y errores de la API de Discord
  if (error.code === 50007) {
    console.error('⚠️ [Discord API Error 50007]: El bot no comparte servidor con el usuario o tiene los DMs cerrados.');
    return res.status(403).json({
      success: false,
      error: 'Error 403: El bot no comparte servidor con el usuario o el usuario tiene los DMs cerrados.'
    });
  }

  if (error.code === 10013) {
    console.error('⚠️ [Discord API Error 10013]: ID de Discord incorrecto (Usuario desconocido).');
    return res.status(404).json({
      success: false,
      error: 'Error 404: El ID de Discord configurado es incorrecto.'
    });
  }

  console.error('❌ Error no controlado al enviar DM:', error);
  return res.status(500).json({
    success: false,
    error: `Error interno: ${error.message || error}`
  });
}

// Middleware para verificar si el bot está listo
const verifyBotReady = (req, res, next) => {
  if (!isBotReady) {
    return res.status(503).json({
      success: false,
      error: 'El bot de Discord aún no está listo. Por favor, inténtelo de nuevo en unos segundos.'
    });
  }
  next();
};

// Middleware para validar el cuerpo de las notificaciones
const validateNotifyBody = (req, res, next) => {
  const { action, message } = req.body;
  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({
      success: false,
      error: 'El campo "message" es obligatorio y debe ser un texto no vacío.'
    });
  }
  next();
};

// Endpoint de prueba de salud (Health Check)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    botReady: isBotReady,
    uptime: process.uptime()
  });
});

/**
 * POST /notify/fer
 * Acción: Envía un DM a Fer
 */
app.post('/notify/fer', verifyBotReady, validateNotifyBody, async (req, res) => {
  const { message } = req.body;
  const ferId = process.env.FER_DISCORD_ID;

  if (!ferId) {
    return res.status(400).json({
      success: false,
      error: 'La variable de entorno FER_DISCORD_ID no está configurada.'
    });
  }

  try {
    await sendDM(ferId, message);
    return res.status(200).json({
      success: true,
      message: 'Mensaje enviado a Fer correctamente.'
    });
  } catch (error) {
    return handleDiscordError(error, res);
  }
});

/**
 * POST /notify/zoe
 * Acción: Envía un DM a Zoe
 */
app.post('/notify/zoe', verifyBotReady, validateNotifyBody, async (req, res) => {
  const { message } = req.body;
  const zoeId = process.env.ZOE_DISCORD_ID;

  if (!zoeId) {
    return res.status(400).json({
      success: false,
      error: 'La variable de entorno ZOE_DISCORD_ID no está configurada.'
    });
  }

  try {
    await sendDM(zoeId, message);
    return res.status(200).json({
      success: true,
      message: 'Mensaje enviado a Zoe correctamente.'
    });
  } catch (error) {
    return handleDiscordError(error, res);
  }
});

/**
 * POST /test-webhooks
 * Acción: Envía un DM de prueba tanto a Fer como a Zoe simultáneamente.
 */
app.post('/test-webhooks', verifyBotReady, async (req, res) => {
  const testMessage = '✅ Prueba de webhook exitosa. Choe-OS está conectado correctamente.';
  const ferId = process.env.FER_DISCORD_ID;
  const zoeId = process.env.ZOE_DISCORD_ID;

  if (!ferId || !zoeId) {
    return res.status(400).json({
      success: false,
      error: 'Las variables FER_DISCORD_ID y/O ZOE_DISCORD_ID no están configuradas.'
    });
  }

  try {
    // Enviamos a ambos de forma paralela usando Promise.all
    // Si cualquiera falla, capturamos el error para devolver el código HTTP correcto.
    await Promise.all([
      sendDM(ferId, testMessage),
      sendDM(zoeId, testMessage)
    ]);

    return res.status(200).json({
      success: true,
      message: 'Mensaje de prueba de webhooks enviado con éxito a Fer y Zoe.'
    });
  } catch (error) {
    return handleDiscordError(error, res);
  }
});

// Cargar token de Discord y realizar login
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;

if (!DISCORD_BOT_TOKEN) {
  console.error('🔴 CRÍTICO: La variable DISCORD_BOT_TOKEN no está definida en el archivo .env. Saliendo...');
  process.exit(1);
}

// Intentar login de Discord y gestionar error de token inválido (401)
client.login(DISCORD_BOT_TOKEN).catch((error) => {
  console.error('❌ Error de conexión al intentar iniciar sesión en Discord:', error.message);
  
  // Si el token es inválido (Error de API 401), se aborta la ejecución con mensaje explícito.
  if (error.status === 401 || error.code === 'TokenInvalid' || error.message.includes('401') || error.message.toLowerCase().includes('token')) {
    console.error('🔴 CRÍTICO (Error 401): El token de Discord es inválido o ha sido reseteado. Abortando conexión...');
    process.exit(1);
  } else {
    process.exit(1);
  }
});

// Inicialización del servidor Express
app.listen(PORT, () => {
  console.log(`🚀 Servidor Express escuchando en http://localhost:${PORT}`);
});
