import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================
// 1. CONEXIÓN A TURSO (Base de datos en la nube)
// ============================================================
// Las credenciales se leen desde las variables de entorno.
// En Render las configurarás como: TURSO_DATABASE_URL y TURSO_AUTH_TOKEN
const db = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ============================================================
// 2. INICIALIZAR ESQUEMA Y SEED (Idempotente)
// ============================================================
// Lee los archivos schema.sql y seed.sql locales y los ejecuta
// en la base de datos remota. Si ya existen las tablas, no hace nada.
try {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const seedPath   = path.join(__dirname, 'seed.sql');

  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await db.executeMultiple(schema);
    console.log('✅ Esquema verificado en Turso.');
  }

  if (fs.existsSync(seedPath)) {
    const seed = fs.readFileSync(seedPath, 'utf8');
    await db.executeMultiple(seed);
    console.log('✅ Seed verificado en Turso.');
  }
} catch (err) {
  console.error('⚠️ Error al inicializar el esquema/seed:', err.message);
}

// ============================================================
// 3. UTILIDADES
// ============================================================
let enTransaccion = false;

function flat(arr) {
  return arr.flat().map(v => (v === undefined ? null : v));
}

// ============================================================
// 4. API COMPATIBLE CON better-sqlite3
// ============================================================
// Mantenemos la misma interfaz (prepare, exec, transaction)
// para no tener que cambiar el resto de tu código.
function prepare(sql) {
  return {
    // Devuelve una sola fila (objeto)
    async get(...params) {
      const result = await db.execute({
        sql: sql,
        args: flat(params)
      });
      return result.rows[0] || undefined;
    },

    // Devuelve todas las filas (array de objetos)
    async all(...params) {
      const result = await db.execute({
        sql: sql,
        args: flat(params)
      });
      return result.rows;
    },

    // Ejecuta una sentencia (INSERT, UPDATE, DELETE)
    async run(...params) {
      let args;
      // Si pasan un objeto { col: valor }, extraemos sus valores
      if (params.length === 1 && typeof params[0] === 'object' && !Array.isArray(params[0])) {
        args = Object.values(params[0]);
      } else {
        args = flat(params);
      }

      const result = await db.execute({
        sql: sql,
        args: args
      });

      return {
        lastInsertRowid: result.lastInsertRowid ? Number(result.lastInsertRowid) : null,
        changes: result.rowsAffected
      };
    }
  };
}

// ============================================================
// 5. EXEC (para múltiples sentencias SQL separadas por ;)
// ============================================================
async function exec(sql) {
  await db.executeMultiple(sql);
}

// ============================================================
// 6. TRANSACCIÓN
// ============================================================
// Uso: await db.transaction(async () => { ... })()
async function transaction(fn) {
  return async (...args) => {
    enTransaccion = true;
    await db.execute('BEGIN');
    try {
      const result = await fn(...args);
      await db.execute('COMMIT');
      enTransaccion = false;
      return result;
    } catch (e) {
      await db.execute('ROLLBACK');
      enTransaccion = false;
      throw e;
    }
  };
}

// ============================================================
// 7. EXPORTAR
// ============================================================
export default { 
  prepare, 
  exec, 
  transaction, 
  _db: db 
};