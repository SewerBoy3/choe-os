import express from 'express';
import prisma from '../prisma.js';
import { formatSongForClient } from '../utils/musicLinkParser.js';

const router = express.Router();

// GET /api/songs — biblioteca pública
router.get('/', async (req, res) => {
  try {
    const canciones = await prisma.cancion.findMany({
      where: { is_published: true },
      orderBy: [{ sort_order: 'asc' }, { id: 'asc' }],
    });

    res.json(canciones.map(formatSongForClient));
  } catch (err) {
    console.error('Error al listar canciones:', err);
    res.status(500).json({ error: 'Error al cargar la biblioteca musical.' });
  }
});

// GET /api/songs/:id
router.get('/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: 'ID inválido.' });

  try {
    const cancion = await prisma.cancion.findFirst({
      where: { id, is_published: true },
    });
    if (!cancion) return res.status(404).json({ error: 'Canción no encontrada.' });
    res.json(formatSongForClient(cancion));
  } catch (err) {
    res.status(500).json({ error: 'Error al cargar la canción.' });
  }
});

export default router;
