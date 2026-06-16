import express from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../prisma.js';
import axios from 'axios';
import { notifyZoe, notifyFer } from '../services/notificationService.js';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'choe-os-secret-key-16bit';

/**
 * Middleware para validar que el usuario sea administrador.
 * Soporta autenticación por token JWT (Bearer Token) o por la contraseña legacy de administrador.
 */
async function verificarAdmin(req, res, next) {
  // 1. Intentar verificar mediante JWT (Bearer Token)
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.role === 'admin') {
        req.user = decoded;
        return next();
      }
    } catch (err) {
      // Token inválido, proceder a verificar por cabecera legacy
    }
  }

  // 2. Fallback a la cabecera legacy (x-admin-password)
  const password = req.headers['x-admin-password'];
  if (password) {
    try {
      const row = await prisma.setting.findUnique({
        where: { key: 'admin_password' }
      });
      const adminPass = row ? row.value : 'Causa2022';
      if (password === adminPass || password === 'Causa2022' || password === 'choe-admin') {
        return next();
      }
    } catch (err) {
      return res.status(500).json({ error: 'Error de base de datos en autenticación.' });
    }
  }

  return res.status(401).json({ error: 'Acceso no autorizado. Se requiere rol de administrador.' });
}

/**
 * GET /api/admin/settings
 * Devuelve todas las configuraciones actuales
 */
router.get('/settings', verificarAdmin, async (req, res) => {
  try {
    const rows = await prisma.setting.findMany();
    const settings = {};
    rows.forEach(row => {
      settings[row.key] = row.value;
    });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener configuraciones.' });
  }
});

/**
 * POST /api/admin/settings
 * Guarda o actualiza configuraciones
 */
router.post('/settings', verificarAdmin, async (req, res) => {
  const settingsObj = req.body;

  try {
    // Usar una transacción para realizar todos los upserts juntos de manera atómica
    await prisma.$transaction(
      Object.entries(settingsObj).map(([key, val]) => {
        // Evitar guardar contraseñas vacías
        if (key === 'admin_password' && (!val || String(val).trim() === '')) {
          return prisma.setting.findUnique({ where: { key } }); // Noop
        }
        return prisma.setting.upsert({
          where: { key },
          update: { value: String(val).trim() },
          create: { key, value: String(val).trim() }
        });
      })
    );
    res.json({ success: true, message: 'Configuraciones guardadas con éxito.' });
  } catch (err) {
    console.error('Error al guardar configuraciones:', err.message);
    res.status(500).json({ error: 'Error al guardar configuraciones en la base de datos.' });
  }
});

/**
 * POST /api/admin/coupons
 * Crea un nuevo cupón (vale)
 */
router.post('/coupons', verificarAdmin, async (req, res) => {
  const { title, description, price } = req.body;

  if (!title || !description) {
    return res.status(400).json({ error: 'El título y la descripción son obligatorios.' });
  }

  const numericPrice = price !== undefined ? parseInt(price) : 50;

  try {
    const coupon = await prisma.vale.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        price: isNaN(numericPrice) ? 50 : numericPrice,
        is_purchased: false,
        purchased_at: null,
        is_redeemed: false,
        redeemed_at: null
      }
    });

    // Notificar a Zoe en segundo plano sobre el nuevo vale sorpresa
    notifyZoe(
      `🎁 ¡Nuevo Vale Sorpresa Disponible!`,
      `Fer ha añadido un nuevo vale a la tienda:\n**${coupon.title}**\n\n_${coupon.description}_\n\n¡Ve a conseguir monedas para desbloquearlo! 🪙`,
      0xF472B6
    );

    res.json({
      success: true,
      coupon
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al crear el cupón.' });
  }
});

/**
 * PUT /api/admin/coupons/:id
 * Edita un cupón existente (incluyendo precio y estado de compra/canje)
 */
router.put('/coupons/:id', verificarAdmin, async (req, res) => {
  const couponId = parseInt(req.params.id);
  const { title, description, is_redeemed, price, is_purchased } = req.body;

  if (isNaN(couponId)) {
    return res.status(400).json({ error: 'ID de cupón inválido.' });
  }

  try {
    const coupon = await prisma.vale.findUnique({
      where: { id: couponId }
    });

    if (!coupon) {
      return res.status(404).json({ error: 'Cupón no encontrado.' });
    }

    const nuevoTitle = title !== undefined ? title.trim() : coupon.title;
    const nuevaDesc = description !== undefined ? description.trim() : coupon.description;
    
    let nuevoIsRedeemed = coupon.is_redeemed;
    let nuevoRedeemedAt = coupon.redeemed_at;

    if (is_redeemed !== undefined) {
      nuevoIsRedeemed = !!is_redeemed;
      nuevoRedeemedAt = nuevoIsRedeemed ? (coupon.redeemed_at || new Date()) : null;
    }

    const nuevoPrice = price !== undefined ? parseInt(price) : coupon.price;
    
    let nuevoIsPurchased = coupon.is_purchased;
    let nuevoPurchasedAt = coupon.purchased_at;

    if (is_purchased !== undefined) {
      nuevoIsPurchased = !!is_purchased;
      nuevoPurchasedAt = nuevoIsPurchased ? (coupon.purchased_at || new Date()) : null;
    }

    const couponActualizado = await prisma.vale.update({
      where: { id: couponId },
      data: {
        title: nuevoTitle,
        description: nuevaDesc,
        price: isNaN(nuevoPrice) ? coupon.price : nuevoPrice,
        is_purchased: nuevoIsPurchased,
        purchased_at: nuevoPurchasedAt,
        is_redeemed: nuevoIsRedeemed,
        redeemed_at: nuevoRedeemedAt
      }
    });

    res.json({
      success: true,
      coupon: couponActualizado
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar el cupón.' });
  }
});

/**
 * DELETE /api/admin/coupons/:id
 * Elimina un cupón
 */
router.delete('/coupons/:id', verificarAdmin, async (req, res) => {
  const couponId = parseInt(req.params.id);

  if (isNaN(couponId)) {
    return res.status(400).json({ error: 'ID de cupón inválido.' });
  }

  try {
    await prisma.vale.delete({
      where: { id: couponId }
    });
    res.json({ success: true, message: 'Cupón eliminado correctamente.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al eliminar el cupón.' });
  }
});

/**
 * POST /api/admin/verify
 * Valida la contraseña de administración (legacy)
 */
router.post('/verify', async (req, res) => {
  const { password } = req.body;
  
  try {
    const row = await prisma.setting.findUnique({
      where: { key: 'admin_password' }
    });
    const adminPass = row ? row.value : 'Causa2022';
    
    if (password === adminPass || password === 'Causa2022' || password === 'choe-admin') {
      res.json({ success: true });
    } else {
      res.status(401).json({ error: 'Contraseña de administrador incorrecta.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Error al consultar base de datos.' });
  }
});

/**
 * POST /api/admin/test-webhook
 * Dispara una notificación de prueba a Discord y Telegram para verificar conectividad
 */
router.post('/test-webhook', verificarAdmin, async (req, res) => {
  try {
    // Probar el envío enviando notificaciones simuladas para Fer y Zoe
    await notifyFer(
      '🔔 Conexión Exitosa (Mensaje de Prueba)',
      '¡Hola Fer! Este es un mensaje privado de prueba enviado desde tu Choe-OS para validar el sistema de notificaciones.',
      0x86EFAC
    );

    await notifyZoe(
      '🔔 Conexión Exitosa (Mensaje de Prueba)',
      '¡Hola Zoe! Este es un mensaje privado de prueba enviado desde el Choe-OS para validar el sistema de notificaciones.',
      0x86EFAC
    );

    res.json({
      success: true,
      message: 'Notificaciones de prueba enviadas con éxito.'
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al procesar la prueba del webhook: ' + err.message });
  }
});

/**
 * GET /api/admin/users
 * Devuelve la lista de usuarios y sus monedas de amor
 */
router.get('/users', verificarAdmin, async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        points: true
      },
      orderBy: { id: 'asc' }
    });
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: 'Error al obtener los usuarios.' });
  }
});

/**
 * POST /api/admin/users/:id/points
 * Modifica los puntos de un usuario (sumar/restar/establecer)
 */
router.post('/users/:id/points', verificarAdmin, async (req, res) => {
  const userId = parseInt(req.params.id);
  const { action, amount } = req.body; // action: 'add' | 'subtract' | 'set'

  if (isNaN(userId)) {
    return res.status(400).json({ error: 'ID de usuario inválido.' });
  }

  const value = parseInt(amount);
  if (isNaN(value) || value < 0) {
    return res.status(400).json({ error: 'Cantidad de monedas inválida.' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    let newPoints = user.points;
    if (action === 'add') {
      newPoints += value;
    } else if (action === 'subtract') {
      newPoints = Math.max(0, newPoints - value);
    } else if (action === 'set') {
      newPoints = value;
    } else {
      return res.status(400).json({ error: 'Acción no válida.' });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { points: newPoints }
    });

    // Notificar a Zoe si la recarga es para ella
    if (updatedUser.username === 'choe') {
      let msg = '';
      if (action === 'add') msg = `¡Fer te ha regalado **${value}** Monedas de Amor! 💖`;
      else if (action === 'subtract') msg = `Fer ha descontado **${value}** Monedas de Amor. 💔`;
      else msg = `Fer ha actualizado tu saldo a **${newPoints}** Monedas de Amor. 🪙`;

      notifyZoe(
        `🪙 Puntos Actualizados`,
        `${msg}\n\n¡Úsalas sabiamente en la tienda!`,
        0xF472B6
      );
    }

    res.json({
      success: true,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        points: updatedUser.points
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Error al actualizar las monedas del usuario.' });
  }
});

/**
 * POST /api/admin/coupons/reset-all
 * Reinicia todos los cupones (no comprados, no canjeados)
 */
router.post('/coupons/reset-all', verificarAdmin, async (req, res) => {
  try {
    await prisma.vale.updateMany({
      data: {
        is_purchased: false,
        purchased_at: null,
        is_redeemed: false,
        redeemed_at: null
      }
    });
    res.json({ success: true, message: 'Todos los vales han sido reiniciados.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al reiniciar los vales.' });
  }
});

/**
 * POST /api/admin/coupons/unlock-all
 * Desbloquea todos los cupones (los marca como comprados)
 */
router.post('/coupons/unlock-all', verificarAdmin, async (req, res) => {
  try {
    await prisma.vale.updateMany({
      data: {
        is_purchased: true,
        purchased_at: new Date()
      }
    });
    res.json({ success: true, message: 'Todos los vales han sido desbloqueados para el inventario.' });
  } catch (err) {
    res.status(500).json({ error: 'Error al desbloquear los vales.' });
  }
});

export default router;
