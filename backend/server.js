import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import path from 'path';
import { fileURLToPath } from 'url';

import db from './db.js';
import { requireAuth, requireRole } from './middleware/auth.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

/* ============================================================
   SEGURIDAD GLOBAL
   ============================================================ */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'"]
    }
  }
}));

app.use(express.json({ limit: '10mb' }));
app.use(cookieParser());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500 }));
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ============================================================
   AUTENTICACIÓN
   ============================================================ */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos. Espere 15 minutos.' }
});

app.post('/api/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password)
    return res.status(400).json({ error: 'Datos incompletos' });

  const user = await db.prepare(`
    SELECT u.*, e.nombre AS establecimiento_nombre
    FROM usuarios u
    LEFT JOIN establecimientos e ON e.id = u.establecimiento_id
    WHERE u.username = ? AND u.activo = 1
  `).get(username);

  if (!user) {
    console.log('LOGIN: usuario no encontrado:', username);
    return res.status(401).json({ error: 'Credenciales inválidas' });
  }

  // Convertir el hash a string (por si llega como Uint8Array desde Turso)
  let hashStr = user.password_hash;
  if (hashStr && typeof hashStr !== 'string') {
    try {
      hashStr = Buffer.from(hashStr).toString('utf8');
    } catch (e) {
      console.log('LOGIN: error convirtiendo hash:', e.message);
    }
  }

  console.log('LOGIN: hash tipo:', typeof hashStr, 'longitud:', hashStr?.length);
  const valido = bcrypt.compareSync(password, hashStr);
  console.log('LOGIN: compareSync:', valido);

  if (!valido)
    return res.status(401).json({ error: 'Credenciales inválidas' });

  const token = jwt.sign(
    {
      id: user.id, username: user.username, rol: user.rol, nombre: user.nombre_completo,
      establecimiento_id: user.establecimiento_id,
      establecimiento_nombre: user.establecimiento_nombre
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES || '8h' }
  );

  res.cookie('token', token, {
    httpOnly: true, sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 8 * 3600 * 1000
  });

  res.json({
    ok: true,
    user: {
      nombre: user.nombre_completo, rol: user.rol,
      establecimiento_id: user.establecimiento_id,
      establecimiento_nombre: user.establecimiento_nombre
    }
  });
});

app.post('/api/logout', (req, res) => { res.clearCookie('token'); res.json({ ok: true }); });
app.get('/api/me', requireAuth, (req, res) => res.json(req.user));

/* ============================================================
   HELPERS (Ahora ASÍNCRONOS)
   ============================================================ */
async function generarCodigoEstablecimiento() {
  const rows = await db.prepare(`SELECT codigo FROM establecimientos WHERE codigo LIKE 'EST-%'`).all();
  let maxNum = 0;
  rows.forEach(r => {
    const m = String(r.codigo).match(/^EST-(\d+)$/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxNum) maxNum = n;
    }
  });
  return 'EST-' + String(maxNum + 1).padStart(3, '0');
}

async function getOrCreateEstablecimiento(nombre) {
  if (!nombre) return null;
  const nombreTrim = String(nombre).trim().toUpperCase();
  if (!nombreTrim) return null;

  let est = await db.prepare('SELECT * FROM establecimientos WHERE UPPER(nombre) = ?').get(nombreTrim);
  if (est) return est;

  const codigo = await generarCodigoEstablecimiento();
  const info = await db.prepare('INSERT INTO establecimientos (codigo, nombre) VALUES (?, ?)').run(codigo, nombreTrim);
  return { id: info.lastInsertRowid, codigo, nombre: nombreTrim };
}

async function getOrCreateUbicacion(nombre) {
  if (!nombre) return null;
  const nombreTrim = String(nombre).trim().toUpperCase();
  if (!nombreTrim) return null;

  let u = await db.prepare('SELECT * FROM ubicaciones WHERE UPPER(nombre) = ?').get(nombreTrim);
  if (u) return u;

  const info = await db.prepare('INSERT INTO ubicaciones (nombre) VALUES (?)').run(nombreTrim);
  return { id: info.lastInsertRowid, nombre: nombreTrim };
}

async function getOrCreateMarca(nombre) {
  if (!nombre) return null;
  const nombreTrim = String(nombre).trim().toUpperCase();
  if (!nombreTrim || nombreTrim === 'SIN MODELO') return null;

  let m = await db.prepare('SELECT * FROM marcas WHERE UPPER(nombre) = ?').get(nombreTrim);
  if (m) return m;

  const info = await db.prepare('INSERT INTO marcas (nombre) VALUES (?)').run(nombreTrim);
  return { id: info.lastInsertRowid, nombre: nombreTrim };
}

async function getOrCreateModelo(nombre, marca_id) {
  if (!nombre) return null;
  const nombreTrim = String(nombre).trim();
  if (!nombreTrim) return null;

  let mo = await db.prepare('SELECT * FROM modelos WHERE UPPER(nombre) = ?').get(nombreTrim.toUpperCase());
  if (mo) return mo;

  const info = await db.prepare('INSERT INTO modelos (nombre, marca_id) VALUES (?, ?)').run(nombreTrim, marca_id || null);
  return { id: info.lastInsertRowid, nombre: nombreTrim, marca_id };
}

async function getOrCreateEstado(nombre) {
  if (!nombre) return null;
  const nombreTrim = String(nombre).trim().toUpperCase();
  if (!nombreTrim) return null;

  let e = await db.prepare('SELECT * FROM estados WHERE UPPER(nombre) = ?').get(nombreTrim);
  if (e) return e;

  const info = await db.prepare('INSERT INTO estados (nombre, color) VALUES (?, ?)').run(nombreTrim, '#64748b');
  return { id: info.lastInsertRowid, nombre: nombreTrim, color: '#64748b' };
}

async function getOrCreateProfesional(nombre) {
  if (!nombre) return null;
  const nombreTrim = String(nombre).trim();
  if (!nombreTrim) return null;

  const [nombres, ...resto] = nombreTrim.split(/\s+/);
  const apellidos = resto.join(' ') || '';

  let p = await db.prepare(`
    SELECT * FROM profesionales
    WHERE UPPER(nombres) = ? AND UPPER(apellidos) = ?
  `).get(nombres.toUpperCase(), apellidos.toUpperCase());

  if (p) return p;

  const info = await db.prepare(`
    INSERT INTO profesionales (nombres, apellidos, profesion)
    VALUES (?, ?, ?)
  `).run(nombres, apellidos || 'Sin especificar', 'Sin especificar');

  return { id: info.lastInsertRowid, nombres, apellidos };
}

async function getTipoInventario(nombre) {
  if (!nombre) return null;
  const nombreTrim = String(nombre).trim().toUpperCase();
  if (!nombreTrim) return null;

  const t = await db.prepare('SELECT * FROM tipos_inventario WHERE UPPER(nombre) = ?').get(nombreTrim);
  if (t) return nombreTrim;

  return 'ACTIVO';
}

/* ============================================================
   DASHBOARD
   ============================================================ */
app.get('/api/dashboard/stats', requireAuth, async (req, res) => {
  const user = req.user;
  const esGlobal = user.rol === 'admin' && !user.establecimiento_id;
  const fBienes = esGlobal ? '' : user.establecimiento_id ? 'WHERE establecimiento_id = ' + user.establecimiento_id : 'WHERE 1=0';

  const totalBienes = (await db.prepare(`SELECT COUNT(*) AS c FROM bienes ${fBienes}`).get()).c;
  const totalProf = (await db.prepare('SELECT COUNT(*) AS c FROM profesionales WHERE activo = 1').get()).c;
  const totalActas = esGlobal
    ? (await db.prepare('SELECT COUNT(*) AS c FROM actas').get()).c
    : user.establecimiento_id
      ? (await db.prepare('SELECT COUNT(*) AS c FROM actas WHERE establecimiento_id = ?').get(user.establecimiento_id)).c
      : 0;
  const totalResp = (await db.prepare('SELECT COUNT(*) AS c FROM encargados WHERE activo = 1').get()).c;

  const porVencer = (await db.prepare(`
    SELECT COUNT(*) AS c FROM bienes
    ${esGlobal ? 'WHERE' : (user.establecimiento_id ? `WHERE establecimiento_id = ${user.establecimiento_id} AND` : 'WHERE 1=0 AND')}
    fecha_mantenimiento IS NOT NULL AND fecha_mantenimiento != ''
    AND date(fecha_mantenimiento) <= date('now', '+25 days')
  `).get()).c;

  const vencidos = (await db.prepare(`
    SELECT COUNT(*) AS c FROM bienes
    ${esGlobal ? 'WHERE' : (user.establecimiento_id ? `WHERE establecimiento_id = ${user.establecimiento_id} AND` : 'WHERE 1=0 AND')}
    fecha_mantenimiento IS NOT NULL AND fecha_mantenimiento != ''
    AND date(fecha_mantenimiento) < date('now')
  `).get()).c;

  const porCondicion = await db.prepare(`
    SELECT e.nombre AS condicion, e.color AS color, COUNT(b.id) AS total
    FROM estados e
    LEFT JOIN bienes b ON b.estado_id = e.id ${esGlobal ? '' : user.establecimiento_id ? `AND b.establecimiento_id = ${user.establecimiento_id}` : 'AND 1=0'}
    GROUP BY e.id, e.nombre, e.color
    ORDER BY e.id
  `).all();

  res.json({
    totales: { bienes: totalBienes, profesionales: totalProf, actas: totalActas, responsables: totalResp, porVencer, vencidos },
    porCondicion,
    scope: esGlobal ? 'global' : 'establecimiento',
    establecimiento_nombre: user.establecimiento_nombre || null
  });
});

/* ============================================================
   USUARIOS
   ============================================================ */
app.get('/api/usuarios', requireAuth, requireRole('admin'), async (req, res) => {
  res.json(await db.prepare(`
    SELECT u.id, u.username, u.nombre_completo, u.rol, u.activo,
           u.establecimiento_id, u.creado_en,
           e.nombre AS establecimiento_nombre
    FROM usuarios u
    LEFT JOIN establecimientos e ON e.id = u.establecimiento_id
    ORDER BY u.id DESC
  `).all());
});

app.post('/api/usuarios', requireAuth, requireRole('admin'), async (req, res) => {
  const { username, password, nombre_completo, rol, establecimiento_id } = req.body;
  if (!username || !password || !nombre_completo || !rol)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  if (!['admin', 'encargado_patrimonio', 'consulta'].includes(rol))
    return res.status(400).json({ error: 'Rol inválido' });
  if (rol !== 'admin' && !establecimiento_id)
    return res.status(400).json({ error: 'Los usuarios no-admin deben tener establecimiento asignado' });

  const existe = await db.prepare('SELECT 1 FROM usuarios WHERE username = ?').get(username);
  if (existe) return res.status(400).json({ error: 'El usuario ya existe' });

  const hash = bcrypt.hashSync(password, 12);
  const info = await db.prepare(`
    INSERT INTO usuarios (username, password_hash, nombre_completo, rol, establecimiento_id)
    VALUES (?, ?, ?, ?, ?)
  `).run(username, hash, nombre_completo, rol, establecimiento_id || null);

  res.json({ id: info.lastInsertRowid });
});

app.put('/api/usuarios/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const id = req.params.id;
  const { password, nombre_completo, rol, establecimiento_id, activo } = req.body;

  const u = await db.prepare('SELECT * FROM usuarios WHERE id = ?').get(id);
  if (!u) return res.status(404).json({ error: 'Usuario no encontrado' });

  const updates = [];
  const params = [];
  if (password) { updates.push('password_hash = ?'); params.push(bcrypt.hashSync(password, 12)); }
  if (nombre_completo) { updates.push('nombre_completo = ?'); params.push(nombre_completo); }
  if (rol) { updates.push('rol = ?'); params.push(rol); }
  if (establecimiento_id !== undefined) { updates.push('establecimiento_id = ?'); params.push(establecimiento_id || null); }
  if (activo !== undefined) { updates.push('activo = ?'); params.push(activo ? 1 : 0); }

  if (updates.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  params.push(id);
  await db.prepare(`UPDATE usuarios SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json({ ok: true });
});

app.delete('/api/usuarios/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const id = req.params.id;
  if (Number(id) === req.user.id)
    return res.status(400).json({ error: 'No puede eliminarse a sí mismo' });
  await db.prepare('UPDATE usuarios SET activo = 0 WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* ============================================================
   ESTABLECIMIENTOS
   ============================================================ */
app.get('/api/establecimientos', requireAuth, async (req, res) => {
  res.json(await db.prepare('SELECT * FROM establecimientos ORDER BY nombre').all());
});

app.get('/api/establecimientos/siguiente-codigo', requireAuth, requireRole('admin'), async (req, res) => {
  res.json({ codigo: await generarCodigoEstablecimiento() });
});

app.post('/api/establecimientos', requireAuth, requireRole('admin'), async (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const nombreTrim = nombre.trim();
  const existe = await db.prepare('SELECT 1 FROM establecimientos WHERE nombre = ?').get(nombreTrim);
  if (existe) return res.status(400).json({ error: 'Ya existe un establecimiento con ese nombre' });

  const codigo = await generarCodigoEstablecimiento();
  const info = await db.prepare('INSERT INTO establecimientos (codigo, nombre) VALUES (?, ?)').run(codigo, nombreTrim);
  res.json({ id: info.lastInsertRowid, codigo });
});

app.put('/api/establecimientos/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const id = req.params.id;
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'El nombre es obligatorio' });
  const nombreTrim = nombre.trim();
  const existe = await db.prepare('SELECT 1 FROM establecimientos WHERE nombre = ? AND id != ?').get(nombreTrim, id);
  if (existe) return res.status(400).json({ error: 'Ya existe otro establecimiento con ese nombre' });

  await db.prepare('UPDATE establecimientos SET nombre = ? WHERE id = ?').run(nombreTrim, id);
  res.json({ ok: true });
});

app.delete('/api/establecimientos/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const id = req.params.id;
  const bienes = (await db.prepare('SELECT COUNT(*) AS c FROM bienes WHERE establecimiento_id = ?').get(id)).c;
  if (bienes > 0)
    return res.status(400).json({ error: `No se puede eliminar: hay ${bienes} bien(es) asignado(s)` });
  const usuarios = (await db.prepare('SELECT COUNT(*) AS c FROM usuarios WHERE establecimiento_id = ?').get(id)).c;
  if (usuarios > 0)
    return res.status(400).json({ error: `No se puede eliminar: hay ${usuarios} usuario(s) asignado(s)` });

  await db.prepare('DELETE FROM establecimientos WHERE id = ?').run(id);
  res.json({ ok: true });
});

/* ============================================================
   CATÁLOGOS
   ============================================================ */
app.get('/api/catalogos', requireAuth, async (req, res) => {
  res.json({
    estados:          await db.prepare('SELECT * FROM estados').all(),
    tipos:            await db.prepare('SELECT * FROM tipos_inventario').all(),
    establecimientos: await db.prepare('SELECT * FROM establecimientos ORDER BY nombre').all(),
    ubicaciones:      await db.prepare('SELECT * FROM ubicaciones ORDER BY nombre').all(),
    marcas:           await db.prepare('SELECT * FROM marcas').all(),
    modelos:          await db.prepare('SELECT * FROM modelos').all()
  });
});

/* ============================================================
   PROFESIONALES
   ============================================================ */
app.get('/api/profesionales', requireAuth, async (req, res) => {
  res.json(await db.prepare('SELECT * FROM profesionales WHERE activo = 1 ORDER BY apellidos, nombres').all());
});

app.post('/api/profesionales', requireAuth, requireRole('admin', 'encargado_patrimonio'), async (req, res) => {
  const { dni, nombres, apellidos, profesion, cargo, telefono, colegiatura } = req.body;
  if (!nombres || !apellidos || !profesion)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  const info = await db.prepare(`
    INSERT INTO profesionales (dni, nombres, apellidos, profesion, cargo, telefono, colegiatura)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(dni || null, nombres, apellidos, profesion, cargo || null, telefono || null, colegiatura || null);

  res.json({ id: info.lastInsertRowid });
});

app.put('/api/profesionales/:id', requireAuth, requireRole('admin', 'encargado_patrimonio'), async (req, res) => {
  const id = req.params.id;
  const { dni, nombres, apellidos, profesion, cargo, telefono, colegiatura } = req.body;

  if (!nombres || !apellidos || !profesion)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  const existe = await db.prepare('SELECT 1 FROM profesionales WHERE id = ?').get(id);
  if (!existe) return res.status(404).json({ error: 'Profesional no encontrado' });

  await db.prepare(`
    UPDATE profesionales SET
      dni = ?, nombres = ?, apellidos = ?, profesion = ?,
      cargo = ?, telefono = ?, colegiatura = ?
    WHERE id = ?
  `).run(
    dni || null, nombres, apellidos, profesion,
    cargo || null, telefono || null, colegiatura || null,
    id
  );

  res.json({ ok: true });
});

app.delete('/api/profesionales/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await db.prepare('UPDATE profesionales SET activo = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ============================================================
   ENCARGADOS
   ============================================================ */
app.get('/api/encargados', requireAuth, async (req, res) => {
  const user = req.user;
  const esGlobal = user.rol === 'admin' && !user.establecimiento_id;
  let sql = `
    SELECT e.*, p.nombres || ' ' || p.apellidos AS profesional,
           p.profesion, p.dni, p.telefono, p.colegiatura
    FROM encargados e
    JOIN profesionales p ON p.id = e.profesional_id
    WHERE e.activo = 1
  `;
  const params = [];
  if (!esGlobal && user.establecimiento_id) {
    const est = await db.prepare('SELECT nombre FROM establecimientos WHERE id = ?').get(user.establecimiento_id);
    if (est) { sql += ' AND e.establecimiento = ?'; params.push(est.nombre); }
  } else if (!esGlobal) {
    sql += ' AND 1=0';
  }
  sql += ' ORDER BY e.desde DESC, e.id DESC';
  res.json(await db.prepare(sql).all(...params));
});

app.get('/api/encargados/activo', requireAuth, async (req, res) => {
  const user = req.user;
  const esGlobal = user.rol === 'admin' && !user.establecimiento_id;
  let sql = `
    SELECT e.*, p.nombres || ' ' || p.apellidos AS profesional,
           p.profesion, p.dni, p.telefono, p.colegiatura
    FROM encargados e
    JOIN profesionales p ON p.id = e.profesional_id
    WHERE e.activo = 1
  `;
  const params = [];
  if (!esGlobal && user.establecimiento_id) {
    const est = await db.prepare('SELECT nombre FROM establecimientos WHERE id = ?').get(user.establecimiento_id);
    if (est) { sql += ' AND e.establecimiento = ?'; params.push(est.nombre); }
  } else if (!esGlobal) {
    sql += ' AND 1=0';
  }
  sql += ' ORDER BY e.desde DESC, e.id DESC LIMIT 1';
  const e = await db.prepare(sql).get(...params);
  res.json(e || null);
});

app.post('/api/encargados', requireAuth, requireRole('admin'), async (req, res) => {
  const { profesional_id, establecimiento, desde } = req.body;
  if (!profesional_id || !establecimiento) return res.status(400).json({ error: 'Faltan campos' });
  const info = await db.prepare(`
    INSERT INTO encargados (profesional_id, establecimiento, cargo, desde)
    VALUES (?, ?, ?, ?)
  `).run(profesional_id, establecimiento, 'RESPONSABLE DE PATRIMONIO', desde || null);
  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/encargados/:id', requireAuth, requireRole('admin'), async (req, res) => {
  const hoy = new Date().toISOString().slice(0, 10);
  await db.prepare('UPDATE encargados SET activo = 0, hasta = ? WHERE id = ?').run(hoy, req.params.id);
  res.json({ ok: true });
});

app.put('/api/encargados/:id/reactivar', requireAuth, requireRole('admin'), async (req, res) => {
  await db.prepare('UPDATE encargados SET activo = 1, hasta = NULL WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ============================================================
   BIENES
   ============================================================ */
app.get('/api/bienes/siguiente-nro', requireAuth, async (req, res) => {
  const user = req.user;
  const esGlobal = user.rol === 'admin' && !user.establecimiento_id;
  let sql = 'SELECT COALESCE(MAX(nro), 0) AS ultimo FROM bienes';
  const params = [];
  if (!esGlobal && user.establecimiento_id) { sql += ' WHERE establecimiento_id = ?'; params.push(user.establecimiento_id); }
  const row = await db.prepare(sql).get(...params);
  res.json({ siguiente: (row.ultimo || 0) + 1 });
});

app.get('/api/bienes', requireAuth, async (req, res) => {
  const user = req.user;
  const esGlobal = user.rol === 'admin' && !user.establecimiento_id;
  const { q } = req.query;

  let sql = `
    SELECT b.*,
           est.nombre AS establecimiento,
           e.nombre   AS estado, e.color AS estado_color,
           ubi.nombre AS ubicacion,
           m.nombre   AS marca,
           mo.nombre  AS modelo,
           p.nombres || ' ' || p.apellidos AS encargado
    FROM bienes b
    LEFT JOIN establecimientos est ON est.id = b.establecimiento_id
    LEFT JOIN estados          e   ON e.id   = b.estado_id
    LEFT JOIN ubicaciones      ubi ON ubi.id = b.ubicacion_id
    LEFT JOIN marcas           m   ON m.id   = b.marca_id
    LEFT JOIN modelos          mo  ON mo.id  = b.modelo_id
    LEFT JOIN profesionales    p   ON p.id   = b.usuario_id
    WHERE 1=1
  `;
  const params = [];

  if (!esGlobal) {
    if (user.establecimiento_id) { sql += ' AND b.establecimiento_id = ?'; params.push(user.establecimiento_id); }
    else { sql += ' AND 1=0'; }
  }

  if (q) {
    sql += ` AND (
      b.descripcion LIKE ? OR
      b.codigo_interno LIKE ? OR
      b.codigo_patrimonio LIKE ? OR
      b.serie LIKE ? OR
      b.color LIKE ? OR
      b.caracteristicas LIKE ? OR
      b.observaciones LIKE ? OR
      b.inventario_2026 LIKE ? OR
      b.medida LIKE ? OR
      b.fecha_mantenimiento LIKE ? OR
      b.tiempo_mantenimiento LIKE ? OR
      m.nombre LIKE ? OR
      mo.nombre LIKE ? OR
      ubi.nombre LIKE ? OR
      est.nombre LIKE ? OR
      e.nombre LIKE ? OR
      p.nombres LIKE ? OR
      p.apellidos LIKE ? OR
      CAST(b.nro AS TEXT) LIKE ?
    )`;
    for (let i = 0; i < 19; i++) params.push(`%${q}%`);
  }

  sql += ' ORDER BY b.nro, b.id';
  res.json(await db.prepare(sql).all(...params));
});

app.get('/api/bienes/:id/ultima-acta', requireAuth, async (req, res) => {
  const bien = await db.prepare('SELECT id, descripcion, codigo_interno, nro FROM bienes WHERE id = ?').get(req.params.id);
  if (!bien) return res.status(404).json({ error: 'Bien no encontrado' });

  const ultima = await db.prepare(`
    SELECT a.id, a.numero, a.fecha, a.tipo, a.estado, a.observaciones,
           pe.nombres || ' ' || pe.apellidos AS entrega_nombre,
           pr.nombres || ' ' || pr.apellidos AS recibe_nombre,
           est.nombre AS establecimiento
    FROM actas_detalle d
    JOIN actas a ON a.id = d.acta_id
    LEFT JOIN profesionales pe ON pe.id = a.entrega_id
    LEFT JOIN profesionales pr ON pr.id = a.recibe_id
    LEFT JOIN establecimientos est ON est.id = a.establecimiento_id
    WHERE d.bien_id = ?
    ORDER BY a.fecha DESC, a.id DESC LIMIT 1
  `).get(req.params.id);

  res.json({ bien, ultima: ultima || null });
});

async function registrarMovimiento(bienId, tipoEvento, ubicacion_id, usuario_id, estado_id, observacion) {
  await db.prepare(`
    INSERT INTO bienes_historial (bien_id, tipo_evento, ubicacion_id, usuario_id, estado_id, observacion)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(bienId, tipoEvento, ubicacion_id ?? null, usuario_id ?? null, estado_id ?? null, observacion ?? null);
}

app.post('/api/bienes', requireAuth, requireRole('admin', 'encargado_patrimonio'), async (req, res) => {
  const user = req.user;
  const b = req.body;
  if (!b.descripcion) return res.status(400).json({ error: 'La descripción es obligatoria' });

  const esGlobal = user.rol === 'admin' && !user.establecimiento_id;
  if (!esGlobal && user.establecimiento_id) b.establecimiento_id = user.establecimiento_id;
  else if (!esGlobal) return res.status(403).json({ error: 'Sin acceso a datos' });

  let nro = b.nro;
  if (nro === null || nro === undefined || nro === '') {
    let sql = 'SELECT COALESCE(MAX(nro), 0) AS ultimo FROM bienes';
    const params = [];
    if (!esGlobal && b.establecimiento_id) { sql += ' WHERE establecimiento_id = ?'; params.push(b.establecimiento_id); }
    const row = await db.prepare(sql).get(...params);
    nro = (row.ultimo || 0) + 1;
  }

  const tx = await db.transaction(async () => {
    const info = await db.prepare(`
      INSERT INTO bienes
        (nro, inventario_2026, codigo_patrimonio, codigo_interno, descripcion,
         establecimiento_id, usuario_id, ubicacion_id, modelo_id, medida, marca_id,
         estado_id, serie, color, caracteristicas,
         fecha_mantenimiento, tiempo_mantenimiento, observaciones)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      nro, b.inventario_2026 ?? null, b.codigo_patrimonio ?? null,
      b.codigo_interno ?? null, b.descripcion,
      b.establecimiento_id ?? null, b.usuario_id ?? null, b.ubicacion_id ?? null,
      b.modelo_id ?? null, b.medida ?? null, b.marca_id ?? null,
      b.estado_id ?? null, b.serie ?? null, b.color ?? null, b.caracteristicas ?? null,
      b.fecha_mantenimiento ?? null, b.tiempo_mantenimiento ?? null, b.observaciones ?? null
    );
    await registrarMovimiento(info.lastInsertRowid, 'CREACION', b.ubicacion_id ?? null, b.usuario_id ?? null, b.estado_id ?? null, 'Alta inicial del bien');
    return info.lastInsertRowid;
  });

  const id = await tx();
  res.json({ id, nro });
});

/* ============================================================
   IMPORTAR BIENES DESDE EXCEL
   ============================================================ */
app.post('/api/bienes/importar', requireAuth, requireRole('admin', 'encargado_patrimonio'), async (req, res) => {
  const user = req.user;
  const { bienes: filas } = req.body;

  if (!Array.isArray(filas) || filas.length === 0)
    return res.status(400).json({ error: 'No hay filas para importar' });

  const esGlobal = user.rol === 'admin' && !user.establecimiento_id;

  const resultados = {
    total: filas.length,
    importados: 0,
    errores: 0,
    detalles: [],
    creados: { establecimientos: 0, ubicaciones: 0, marcas: 0, modelos: 0, estados: 0, profesionales: 0 }
  };

  const tx = await db.transaction(async () => {
    let nroActual;
    if (!esGlobal && user.establecimiento_id) {
      const row = await db.prepare('SELECT COALESCE(MAX(nro), 0) AS ultimo FROM bienes WHERE establecimiento_id = ?').get(user.establecimiento_id);
      nroActual = (row.ultimo || 0) + 1;
    } else {
      const row = await db.prepare('SELECT COALESCE(MAX(nro), 0) AS ultimo FROM bienes').get();
      nroActual = (row.ultimo || 0) + 1;
    }

    for (let idx = 0; idx < filas.length; idx++) {
      const fila = filas[idx];
      try {
        const descripcion = (fila.descripcion || '').toString().trim();
        if (!descripcion) {
          resultados.errores++;
          resultados.detalles.push({ fila: idx + 2, error: 'Descripción vacía' });
          continue;
        }

        let estId = null;
        if (!esGlobal && user.establecimiento_id) {
          estId = user.establecimiento_id;
        } else {
          const nombreEst = (fila.establecimiento || '').toString().trim();
          if (nombreEst) {
            const exist = await db.prepare('SELECT id FROM establecimientos WHERE UPPER(nombre) = ?').get(nombreEst.toUpperCase());
            if (exist) estId = exist.id;
            else {
              const est = await getOrCreateEstablecimiento(nombreEst);
              estId = est.id;
              resultados.creados.establecimientos++;
            }
          }
        }

        if (!estId) {
          resultados.errores++;
          resultados.detalles.push({ fila: idx + 2, error: 'Sin establecimiento' });
          continue;
        }

        let ubiId = null;
        const nombreUbi = (fila.ubicacion || '').toString().trim();
        if (nombreUbi) {
          const exist = await db.prepare('SELECT id FROM ubicaciones WHERE UPPER(nombre) = ?').get(nombreUbi.toUpperCase());
          if (exist) ubiId = exist.id;
          else {
            const u = await getOrCreateUbicacion(nombreUbi);
            ubiId = u.id;
            resultados.creados.ubicaciones++;
          }
        }

        let marcaId = null;
        const nombreMarca = (fila.marca || '').toString().trim();
        if (nombreMarca) {
          const exist = await db.prepare('SELECT id FROM marcas WHERE UPPER(nombre) = ?').get(nombreMarca.toUpperCase());
          if (exist) marcaId = exist.id;
          else {
            const m = await getOrCreateMarca(nombreMarca);
            if (m) { marcaId = m.id; resultados.creados.marcas++; }
          }
        }

        let modeloId = null;
        const nombreModelo = (fila.modelo || '').toString().trim();
        if (nombreModelo) {
          const exist = await db.prepare('SELECT id FROM modelos WHERE UPPER(nombre) = ?').get(nombreModelo.toUpperCase());
          if (exist) modeloId = exist.id;
          else {
            const mo = await getOrCreateModelo(nombreModelo, marcaId);
            if (mo) { modeloId = mo.id; resultados.creados.modelos++; }
          }
        }

        let estadoId = null;
        const nombreEstado = (fila.condicion || fila.estado || '').toString().trim();
        if (nombreEstado) {
          const exist = await db.prepare('SELECT id FROM estados WHERE UPPER(nombre) = ?').get(nombreEstado.toUpperCase());
          if (exist) estadoId = exist.id;
          else {
            const e = await getOrCreateEstado(nombreEstado);
            if (e) { estadoId = e.id; resultados.creados.estados++; }
          }
        }

        let profId = null;
        const nombreProf = (fila.usuario || '').toString().trim();
        if (nombreProf) {
          const partes = nombreProf.split(/\s+/);
          const nombres = partes[0] || '';
          const apellidos = partes.slice(1).join(' ') || '';
          const exist = await db.prepare(`
            SELECT id FROM profesionales
            WHERE UPPER(nombres) = ? AND UPPER(apellidos) = ?
          `).get(nombres.toUpperCase(), apellidos.toUpperCase());

          if (exist) profId = exist.id;
          else if (nombres) {
            const info = await db.prepare(`
              INSERT INTO profesionales (nombres, apellidos, profesion)
              VALUES (?, ?, ?)
            `).run(nombres, apellidos || 'Sin especificar', 'Sin especificar');
            profId = info.lastInsertRowid;
            resultados.creados.profesionales++;
          }
        }

        let inventario2026 = (fila.inventario_2026 || fila['Inv. 2026'] || 'ACTIVO').toString().trim().toUpperCase();
        const tipo = await db.prepare('SELECT nombre FROM tipos_inventario WHERE UPPER(nombre) = ?').get(inventario2026);
        if (!tipo) inventario2026 = 'ACTIVO';

        await db.prepare(`
          INSERT INTO bienes
            (nro, inventario_2026, codigo_patrimonio, codigo_interno, descripcion,
             establecimiento_id, usuario_id, ubicacion_id, modelo_id, medida, marca_id,
             estado_id, serie, color, caracteristicas,
             fecha_mantenimiento, tiempo_mantenimiento, observaciones)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          nroActual,
          inventario2026,
          (fila.codigo_patrimonio || '').toString().trim() || null,
          (fila.codigo_interno || '').toString().trim() || null,
          descripcion,
          estId,
          profId,
          ubiId,
          modeloId,
          (fila.medida || '').toString().trim() || null,
          marcaId,
          estadoId,
          (fila.serie || '').toString().trim() || null,
          (fila.color || '').toString().trim() || null,
          (fila.caracteristicas || '').toString().trim() || null,
          (fila.fecha_mantenimiento || '').toString().trim() || null,
          (fila.tiempo_mantenimiento || '').toString().trim() || null,
          (fila.observaciones || '').toString().trim() || null
        );

        nroActual++;
        resultados.importados++;
      } catch (err) {
        resultados.errores++;
        resultados.detalles.push({ fila: idx + 2, error: err.message });
      }
    }
  });

  try {
    await tx();
    res.json({ ok: true, ...resultados });
  } catch (err) {
    res.status(500).json({ error: 'Error en la importación: ' + err.message });
  }
});

/* ============================================================
   ACTUALIZAR / ELIMINAR BIEN
   ============================================================ */
app.put('/api/bienes/:id', requireAuth, requireRole('admin', 'encargado_patrimonio'), async (req, res) => {
  const user = req.user;
  const id = req.params.id;
  const b = req.body;

  const anterior = await db.prepare('SELECT * FROM bienes WHERE id = ?').get(id);
  if (!anterior) return res.status(404).json({ error: 'Bien no encontrado' });

  const esGlobal = user.rol === 'admin' && !user.establecimiento_id;
  if (!esGlobal && String(anterior.establecimiento_id) !== String(user.establecimiento_id))
    return res.status(403).json({ error: 'Sin acceso a este bien' });

  if (!esGlobal && user.establecimiento_id) b.establecimiento_id = user.establecimiento_id;

  await db.prepare(`
    UPDATE bienes SET
      nro = ?, inventario_2026 = ?, codigo_patrimonio = ?, codigo_interno = ?,
      descripcion = ?, establecimiento_id = ?, usuario_id = ?, ubicacion_id = ?,
      modelo_id = ?, medida = ?, marca_id = ?, estado_id = ?, serie = ?,
      color = ?, caracteristicas = ?, fecha_mantenimiento = ?,
      tiempo_mantenimiento = ?, observaciones = ?, actualizado_en = datetime('now')
    WHERE id = ?
  `).run(
    b.nro ?? null, b.inventario_2026 ?? null, b.codigo_patrimonio ?? null,
    b.codigo_interno ?? null, b.descripcion, b.establecimiento_id ?? null,
    b.usuario_id ?? null, b.ubicacion_id ?? null, b.modelo_id ?? null,
    b.medida ?? null, b.marca_id ?? null, b.estado_id ?? null, b.serie ?? null,
    b.color ?? null, b.caracteristicas ?? null, b.fecha_mantenimiento ?? null,
    b.tiempo_mantenimiento ?? null, b.observaciones ?? null, id
  );

  const cambioUbicacion = String(anterior.ubicacion_id || '') !== String(b.ubicacion_id || '');
  const cambioUsuario   = String(anterior.usuario_id || '')   !== String(b.usuario_id || '');
  const cambioEstado    = String(anterior.estado_id || '')    !== String(b.estado_id || '');

  if (cambioUbicacion || cambioUsuario || cambioEstado) {
    let tipo = 'EDICION';
    if (cambioUbicacion || cambioUsuario) tipo = 'TRASLADO';
    const nuevoEstado = b.estado_id ? await db.prepare('SELECT nombre FROM estados WHERE id = ?').get(b.estado_id) : null;
    if (nuevoEstado && nuevoEstado.nombre.toUpperCase() === 'CHATARRA') tipo = 'BAJA';
    await registrarMovimiento(id, tipo, b.ubicacion_id ?? null, b.usuario_id ?? null, b.estado_id ?? null, null);
  }
  res.json({ ok: true });
});

app.delete('/api/bienes/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await db.prepare('DELETE FROM bienes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ============================================================
   HISTORIAL
   ============================================================ */
app.get('/api/bienes/:id/historial', requireAuth, async (req, res) => {
  const bien = await db.prepare(`
    SELECT b.*, e.nombre AS estado, e.color AS estado_color,
           ubi.nombre AS ubicacion,
           p.nombres || ' ' || p.apellidos AS encargado
    FROM bienes b
    LEFT JOIN estados e ON e.id = b.estado_id
    LEFT JOIN ubicaciones ubi ON ubi.id = b.ubicacion_id
    LEFT JOIN profesionales p ON p.id = b.usuario_id
    WHERE b.id = ?
  `).get(req.params.id);
  if (!bien) return res.status(404).json({ error: 'Bien no encontrado' });

  const movimientos = await db.prepare(`
    SELECT h.*, ubi.nombre AS ubicacion,
           e.nombre AS estado, e.color AS estado_color,
           p.nombres || ' ' || p.apellidos AS receptor,
           p.profesion AS receptor_profesion
    FROM bienes_historial h
    LEFT JOIN ubicaciones ubi ON ubi.id = h.ubicacion_id
    LEFT JOIN estados e ON e.id = h.estado_id
    LEFT JOIN profesionales p ON p.id = h.usuario_id
    WHERE h.bien_id = ?
    ORDER BY h.fecha ASC, h.id ASC
  `).all(req.params.id);

  res.json({ bien, movimientos });
});

/* ============================================================
   ACTAS
   ============================================================ */
app.get('/api/actas', requireAuth, async (req, res) => {
  const user = req.user;
  const esGlobal = user.rol === 'admin' && !user.establecimiento_id;
  let sql = `
    SELECT a.*, pe.nombres || ' ' || pe.apellidos AS entrega_nombre,
           pr.nombres || ' ' || pr.apellidos AS recibe_nombre
    FROM actas a
    LEFT JOIN profesionales pe ON pe.id = a.entrega_id
    LEFT JOIN profesionales pr ON pr.id = a.recibe_id
    WHERE 1=1
  `;
  const params = [];
  if (!esGlobal) {
    if (user.establecimiento_id) { sql += ' AND a.establecimiento_id = ?'; params.push(user.establecimiento_id); }
    else { sql += ' AND 1=0'; }
  }
  sql += ' ORDER BY a.fecha DESC, a.id DESC';
  res.json(await db.prepare(sql).all(...params));
});

app.get('/api/actas/:id', requireAuth, async (req, res) => {
  const acta = await db.prepare(`
    SELECT a.*, pe.nombres || ' ' || pe.apellidos AS entrega_nombre,
           pe.profesion AS entrega_profesion, pe.dni AS entrega_dni,
           pr.nombres || ' ' || pr.apellidos AS recibe_nombre,
           pr.profesion AS recibe_profesion, pr.dni AS recibe_dni,
           est.nombre AS establecimiento
    FROM actas a
    LEFT JOIN profesionales pe ON pe.id = a.entrega_id
    LEFT JOIN profesionales pr ON pr.id = a.recibe_id
    LEFT JOIN establecimientos est ON est.id = a.establecimiento_id
    WHERE a.id = ?
  `).get(req.params.id);
  if (!acta) return res.status(404).json({ error: 'No encontrada' });

  acta.detalle = await db.prepare(`
    SELECT d.id, d.acta_id, d.bien_id, d.estado_entrega, d.observacion,
           b.descripcion, b.codigo_interno, b.codigo_patrimonio, b.serie,
           b.color, b.medida, b.caracteristicas, b.nro, b.inventario_2026,
           mo.nombre AS modelo, m.nombre AS marca,
           e.nombre AS estado, e.color AS estado_color,
           ubi.nombre AS ubicacion, ubi.nombre AS servicio,
           p.nombres || ' ' || p.apellidos AS encargado
    FROM actas_detalle d
    JOIN bienes b ON b.id = d.bien_id
    LEFT JOIN modelos mo ON mo.id = b.modelo_id
    LEFT JOIN marcas m ON m.id = b.marca_id
    LEFT JOIN estados e ON e.id = b.estado_id
    LEFT JOIN ubicaciones ubi ON ubi.id = b.ubicacion_id
    LEFT JOIN profesionales p ON p.id = b.usuario_id
    WHERE d.acta_id = ?
    ORDER BY d.id
  `).all(req.params.id);

  res.json(acta);
});

app.post('/api/actas', requireAuth, requireRole('admin', 'encargado_patrimonio'), async (req, res) => {
  const user = req.user;
  const { tipo, numero, fecha, entrega_id, recibe_id, encargado_id,
          establecimiento_id, observaciones, bienes } = req.body;
  if (!tipo || !numero || !fecha || !Array.isArray(bienes) || bienes.length === 0)
    return res.status(400).json({ error: 'Datos incompletos' });

  const esGlobal = user.rol === 'admin' && !user.establecimiento_id;
  const estId = esGlobal ? (establecimiento_id || null) : user.establecimiento_id;

  const tx = await db.transaction(async () => {
    const info = await db.prepare(`
      INSERT INTO actas
        (tipo, numero, fecha, entrega_id, recibe_id, encargado_id,
         establecimiento_id, observaciones, estado)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'EMITIDA')
    `).run(tipo, numero, fecha, entrega_id || null, recibe_id || null,
           encargado_id || null, estId, observaciones || null);

    const insDet = db.prepare(`
      INSERT INTO actas_detalle (acta_id, bien_id, estado_entrega, observacion)
      VALUES (?, ?, ?, ?)
    `);
    for (const b of bienes)
      await insDet.run(info.lastInsertRowid, b.id, b.estado_entrega || null, b.observacion || null);

    return info.lastInsertRowid;
  });

  res.json({ id: await tx() });
});

/* ============================================================
   REPORTES
   ============================================================ */
app.get('/api/reportes/bienes', requireAuth, async (req, res) => {
  const { estado, condicion, ubicacion } = req.query;
  let sql = `
    SELECT b.*, est.nombre AS establecimiento,
           e.nombre AS estado_nombre, e.color AS estado_color,
           ubi.nombre AS ubicacion, m.nombre AS marca, mo.nombre AS modelo,
           p.nombres || ' ' || p.apellidos AS encargado
    FROM bienes b
    LEFT JOIN establecimientos est ON est.id = b.establecimiento_id
    LEFT JOIN estados e ON e.id = b.estado_id
    LEFT JOIN ubicaciones ubi ON ubi.id = b.ubicacion_id
    LEFT JOIN marcas m ON m.id = b.marca_id
    LEFT JOIN modelos mo ON mo.id = b.modelo_id
    LEFT JOIN profesionales p ON p.id = b.usuario_id
    WHERE 1=1
  `;
  const params = [];
  if (estado) { sql += ` AND UPPER(b.inventario_2026) = UPPER(?)`; params.push(estado); }
  if (condicion) { sql += ` AND b.estado_id = ?`; params.push(condicion); }
  if (ubicacion) { sql += ` AND ubi.nombre = ?`; params.push(ubicacion); }
  sql += ' ORDER BY b.nro, b.id';
  res.json(await db.prepare(sql).all(...params));
});

/* ============================================================
   ALMACÉN — SUMINISTROS
   ============================================================ */
app.get('/api/suministros', requireAuth, async (req, res) => {
  const { q } = req.query;
  let sql = 'SELECT * FROM suministros WHERE activo = 1';
  const params = [];
  if (q) {
    sql += ' AND (descripcion LIKE ? OR codigo LIKE ? OR unidad_medida LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY descripcion';
  res.json(await db.prepare(sql).all(...params));
});

app.get('/api/suministros/siguiente-codigo', requireAuth, async (req, res) => {
  const rows = await db.prepare(`SELECT codigo FROM suministros WHERE codigo LIKE 'SUM-%'`).all();
  let maxNum = 0;
  rows.forEach(r => {
    const m = String(r.codigo).match(/^SUM-(\d+)$/);
    if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
  });
  res.json({ codigo: 'SUM-' + String(maxNum + 1).padStart(4, '0') });
});

app.post('/api/suministros', requireAuth, requireRole('admin', 'encargado_patrimonio'), async (req, res) => {
  const { codigo, descripcion, unidad_medida, stock_minimo } = req.body;
  if (!descripcion) return res.status(400).json({ error: 'La descripción es obligatoria' });

  const info = await db.prepare(`
    INSERT INTO suministros (codigo, descripcion, unidad_medida, stock_minimo)
    VALUES (?, ?, ?, ?)
  `).run(codigo || null, descripcion, unidad_medida || null, stock_minimo || 0);

  res.json({ id: info.lastInsertRowid });
});

app.put('/api/suministros/:id', requireAuth, requireRole('admin', 'encargado_patrimonio'), async (req, res) => {
  const { codigo, descripcion, unidad_medida, stock_minimo } = req.body;
  if (!descripcion) return res.status(400).json({ error: 'La descripción es obligatoria' });
  await db.prepare(`
    UPDATE suministros SET codigo = ?, descripcion = ?, unidad_medida = ?, stock_minimo = ?
    WHERE id = ?
  `).run(codigo || null, descripcion, unidad_medida || null, stock_minimo || 0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/suministros/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await db.prepare('UPDATE suministros SET activo = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ============================================================
   ALMACÉN — MOVIMIENTOS (INGRESOS / SALIDAS)
   ============================================================ */
app.get('/api/almacen/movimientos', requireAuth, async (req, res) => {
  const { q, tipo } = req.query;
  let sql = `
    SELECT m.*,
           s.descripcion AS suministro, s.codigo AS suministro_codigo, s.unidad_medida,
           est.nombre AS establecimiento,
           p.nombres || ' ' || p.apellidos AS usuario
    FROM almacen_movimientos m
    JOIN suministros s ON s.id = m.suministro_id
    LEFT JOIN establecimientos est ON est.id = m.establecimiento_id
    LEFT JOIN profesionales p ON p.id = m.usuario_id
    WHERE 1=1
  `;
  const params = [];
  if (tipo) { sql += ' AND m.tipo = ?'; params.push(tipo); }
  if (q) {
    sql += ` AND (
      s.descripcion LIKE ? OR s.codigo LIKE ? OR
      m.ubicacion LIKE ? OR m.marca LIKE ? OR m.color LIKE ? OR
      m.estado LIKE ? OR m.observacion LIKE ? OR
      est.nombre LIKE ? OR p.nombres LIKE ? OR p.apellidos LIKE ?
    )`;
    for (let i = 0; i < 10; i++) params.push(`%${q}%`);
  }
  sql += ' ORDER BY m.id DESC';
  res.json(await db.prepare(sql).all(...params));
});

app.post('/api/almacen/movimientos', requireAuth, requireRole('admin', 'encargado_patrimonio'), async (req, res) => {
  const m = req.body;
  if (!m.suministro_id || !m.cantidad || !m.tipo)
    return res.status(400).json({ error: 'Faltan campos obligatorios' });

  if (!['INGRESO','SALIDA'].includes(m.tipo))
    return res.status(400).json({ error: 'Tipo inválido' });

  const info = await db.prepare(`
    INSERT INTO almacen_movimientos
      (tipo, suministro_id, cantidad, establecimiento_id, ubicacion, usuario_id,
       estado, marca, color, modelo, medidas, fecha_ingreso, fecha_salida, observacion)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    m.tipo, m.suministro_id, m.cantidad,
    m.establecimiento_id || null, m.ubicacion || null, m.usuario_id || null,
    m.estado || null, m.marca || null, m.color || null, m.modelo || null, m.medidas || null,
    m.fecha_ingreso || null, m.fecha_salida || null, m.observacion || null
  );

  res.json({ id: info.lastInsertRowid });
});

app.delete('/api/almacen/movimientos/:id', requireAuth, requireRole('admin'), async (req, res) => {
  await db.prepare('DELETE FROM almacen_movimientos WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ============================================================
   ALMACÉN — STOCK (suma de ingresos - salidas)
   ============================================================ */
app.get('/api/almacen/stock', requireAuth, async (req, res) => {
  const { q } = req.query;
  let sql = `
    SELECT s.id, s.codigo, s.descripcion, s.unidad_medida, s.stock_minimo,
           COALESCE(SUM(CASE WHEN m.tipo='INGRESO' THEN m.cantidad ELSE 0 END), 0) AS total_ingresos,
           COALESCE(SUM(CASE WHEN m.tipo='SALIDA'  THEN m.cantidad ELSE 0 END), 0) AS total_salidas
    FROM suministros s
    LEFT JOIN almacen_movimientos m ON m.suministro_id = s.id
    WHERE s.activo = 1
  `;
  const params = [];
  if (q) {
    sql += ' AND (s.descripcion LIKE ? OR s.codigo LIKE ? OR s.unidad_medida LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' GROUP BY s.id ORDER BY s.descripcion';
  const rows = await db.prepare(sql).all(...params);
  rows.forEach(r => r.stock = r.total_ingresos - r.total_salidas);
  res.json(rows);
});

/* ============================================================
   ALMACÉN — KARDEX (historial por suministro)
   ============================================================ */
app.get('/api/almacen/kardex/:suministro_id', requireAuth, async (req, res) => {
  const movimientos = await db.prepare(`
    SELECT m.*,
           est.nombre AS establecimiento,
           p.nombres || ' ' || p.apellidos AS usuario
    FROM almacen_movimientos m
    LEFT JOIN establecimientos est ON est.id = m.establecimiento_id
    LEFT JOIN profesionales p ON p.id = m.usuario_id
    WHERE m.suministro_id = ?
    ORDER BY m.creado_en ASC, m.id ASC
  `).all(req.params.suministro_id);

  let saldo = 0;
  const kardex = movimientos.map(m => {
    if (m.tipo === 'INGRESO') saldo += m.cantidad;
    else saldo -= m.cantidad;
    return { ...m, saldo };
  });

  res.json(kardex);
});

/* ============================================================
   SPA FALLBACK
   ============================================================ */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

/* ============================================================
   ARRANQUE
   ============================================================ */
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log('  ✅ Sistema de Patrimonio - Micro Red Paucará');
  console.log('═══════════════════════════════════════════════');
  console.log(`  🌐 URL:      http://localhost:${PORT}`);
  console.log(`  👤 Usuario:  admin`);
  console.log(`  🔑 Password: admin123`);
  console.log('═══════════════════════════════════════════════');
  console.log('');
});