import prisma from '../prisma.js';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Envía un mensaje privado directo (DM) a un usuario de Discord usando el bot.
 * Utiliza dos llamadas a la API oficial de Discord.
 */
async function sendDiscordDM(botToken, recipientId, title, description, color, contentText) {
  try {
    const cleanToken = botToken.trim();
    const cleanRecipient = recipientId.trim();

    // 1. Crear canal DM con el usuario
    const channelRes = await axios.post(
      'https://discord.com/api/v10/users/@me/channels',
      { recipient_id: cleanRecipient },
      {
        headers: {
          Authorization: `Bot ${cleanToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const channelId = channelRes.data?.id;
    if (!channelId) {
      throw new Error('No se pudo abrir el canal DM privado.');
    }

    // 2. Enviar el mensaje al canal DM privado
    await axios.post(
      `https://discord.com/api/v10/channels/${channelId}/messages`,
      {
        content: `🤫 **Mensaje Privado**\n${contentText}`,
        embeds: [
          {
            title: title,
            description: description,
            color: color,
            footer: { text: 'Choe-OS • Notificación Privada' },
          },
        ],
      },
      {
        headers: {
          Authorization: `Bot ${cleanToken}`,
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`🚀 DM privado de Discord enviado con éxito al usuario: ${cleanRecipient}`);
    return true;
  } catch (err) {
    const errorDetails = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('❌ Error al enviar DM privado de Discord:', errorDetails);
    return false;
  }
}

/**
 * Servicio unificado de notificaciones.
 * Envía mensajes a través de Discord (DMs privados o Webhook) y Telegram Bot.
 */
async function sendNotification({ target, title, description, color = 0xFFB6C1 }) {
  try {
    // 1. Obtener configuraciones de la base de datos
    const rows = await prisma.setting.findMany();
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });

    const DISCORD_BOT_TOKEN = settings.discord_bot_token || null;
    const DISCORD_WEBHOOK_URL = settings.discord_webhook || process.env.DISCORD_WEBHOOK_URL || null;
    const TELEGRAM_BOT_TOKEN = settings.telegram_token || process.env.TELEGRAM_BOT_TOKEN || null;
    const TELEGRAM_CHAT_ID = settings.telegram_chat_id || process.env.TELEGRAM_CHAT_ID || null;

    const ferDiscordId = settings.discord_user_id_fer || '';
    const zoeDiscordId = settings.discord_user_id_zoe || '';

    const ahora = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });

    // Determinar destinatario
    let targetDiscordId = '';
    let mentionLabel = '';
    let mentionText = '';

    if (target === 'fer') {
      targetDiscordId = ferDiscordId;
      mentionText = ferDiscordId ? `<@${ferDiscordId.trim()}>` : '';
      mentionLabel = 'Para: Fer (Admin)';
    } else if (target === 'zoe') {
      targetDiscordId = zoeDiscordId;
      mentionText = zoeDiscordId ? `<@${zoeDiscordId.trim()}>` : '';
      mentionLabel = 'Para: Zoe (Usuario)';
    }

    const contentText = `🔔 **NOTIFICACIÓN CHOE-OS** 🔔\n\n` +
      `**${title}**\n` +
      `📝 ${description}\n` +
      `⏰ **Fecha:** ${ahora} (ARG)\n` +
      `💖 *Choe-OS System*`;

    // 2. Intentar enviar DM privado usando el nuevo microservicio de bot de Discord (si está configurado)
    let sentViaDM = false;
    const DISCORD_BOT_URL = process.env.DISCORD_BOT_URL || settings.discord_bot_url || null;

    if (DISCORD_BOT_URL && (target === 'fer' || target === 'zoe')) {
      try {
        const endpoint = target === 'fer' ? '/notify/fer' : '/notify/zoe';
        const response = await axios.post(`${DISCORD_BOT_URL.replace(/\/$/, '')}${endpoint}`, {
          action: title,
          message: contentText
        });
        if (response.status === 200) {
          sentViaDM = true;
          console.log(`🚀 DM privado de Discord enviado con éxito vía microservicio a ${target}`);
        }
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        console.error(`❌ Error al enviar DM vía microservicio a ${target}:`, errMsg);
      }
    }

    // Fallback al método directo de Discord API si no se usó o falló el microservicio
    if (!sentViaDM && DISCORD_BOT_TOKEN && targetDiscordId) {
      sentViaDM = await sendDiscordDM(
        DISCORD_BOT_TOKEN,
        targetDiscordId,
        title,
        description,
        color,
        contentText
      );
    }

    // 3. Fallback a Webhook público si falló el DM o si no está configurado el Bot
    if (!sentViaDM && DISCORD_WEBHOOK_URL) {
      try {
        const publicContent = `${mentionText} ${contentText}`;
        await axios.post(DISCORD_WEBHOOK_URL, {
          content: publicContent,
          embeds: [
            {
              title: title,
              description: description,
              color: color,
              fields: [
                { name: 'Fecha y Hora (ARG)', value: ahora, inline: true },
                { name: 'Destinatario', value: mentionLabel || 'General', inline: true }
              ],
              footer: { text: 'Choe-OS • Canal Público' }
            }
          ]
        });
        console.log('🚀 Notificación de Discord enviada con éxito vía Webhook.');
      } catch (err) {
        console.error('❌ Error al enviar a Discord Webhook:', err.message);
      }
    }

    // 4. Enviar a Telegram
    if (TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID) {
      try {
        const telegramUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
        const telegramText = `🔔 *NOTIFICACIÓN CHOE-OS*\n\n` +
          `*${title}*\n` +
          `📝 ${description}\n` +
          `⏰ ${ahora} (ARG)`;

        await axios.post(telegramUrl, {
          chat_id: TELEGRAM_CHAT_ID,
          text: telegramText,
          parse_mode: 'Markdown'
        });
        console.log('🚀 Notificación de Telegram enviada con éxito.');
      } catch (err) {
        console.error('❌ Error al enviar a Telegram:', err.message);
      }
    }
  } catch (error) {
    console.error('❌ Error general en sendNotification:', error.message);
  }
}

/**
 * Notificar a Fer (Admin) sobre acciones hechas por Zoe
 */
export async function notifyFer(title, description, color = 0xFBBF24) {
  return sendNotification({ target: 'fer', title, description, color });
}

/**
 * Notificar a Zoe (Usuario) sobre sorpresas o acciones hechas por Fer
 */
export async function notifyZoe(title, description, color = 0xF472B6) {
  return sendNotification({ target: 'zoe', title, description, color });
}

/**
 * Notificación general
 */
export async function notifyGeneral(title, description, color = 0x818CF8) {
  return sendNotification({ target: 'general', title, description, color });
}
