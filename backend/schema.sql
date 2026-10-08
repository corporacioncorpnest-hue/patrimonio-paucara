PRAGMA foreign_keys = ON;

-- ============================================
-- USUARIOS DEL SISTEMA
-- ============================================
CREATE TABLE IF NOT EXISTS usuarios (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  username              TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash         TEXT NOT NULL,
  nombre_completo       TEXT NOT NULL,
  rol                   TEXT NOT NULL CHECK (rol IN ('admin','encargado_patrimonio','consulta')),
  establecimiento_id    INTEGER,
  activo                INTEGER NOT NULL DEFAULT 1,
  intentos              INTEGER NOT NULL DEFAULT 0,
  bloqueado_hasta       TEXT,
  creado_en             TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (establecimiento_id) REFERENCES establecimientos(id)
);

-- ============================================
-- PROFESIONALES
-- ============================================
CREATE TABLE IF NOT EXISTS profesionales (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  dni          TEXT UNIQUE,
  nombres      TEXT NOT NULL,
  apellidos    TEXT NOT NULL,
  profesion    TEXT NOT NULL,
  cargo        TEXT,
  telefono     TEXT,
  colegiatura  TEXT,
  activo       INTEGER NOT NULL DEFAULT 1,
  creado_en    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- ENCARGADOS DE PATRIMONIO
-- ============================================
CREATE TABLE IF NOT EXISTS encargados (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  profesional_id  INTEGER NOT NULL,
  establecimiento TEXT NOT NULL,
  cargo           TEXT NOT NULL,
  desde           TEXT,
  hasta           TEXT,
  activo          INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (profesional_id) REFERENCES profesionales(id) ON DELETE RESTRICT
);

-- ============================================
-- CATÁLOGOS
-- ============================================
CREATE TABLE IF NOT EXISTS establecimientos (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT NOT NULL UNIQUE,
  nombre TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ubicaciones (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS marcas (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS modelos (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre   TEXT NOT NULL,
  marca_id INTEGER,
  FOREIGN KEY (marca_id) REFERENCES marcas(id)
);

CREATE TABLE IF NOT EXISTS estados (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE,
  color  TEXT
);

CREATE TABLE IF NOT EXISTS tipos_inventario (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

-- ============================================
-- BIENES PATRIMONIALES
-- ============================================
CREATE TABLE IF NOT EXISTS bienes (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  nro                   INTEGER,
  inventario_2026       TEXT,
  codigo_patrimonio     TEXT,
  codigo_interno        TEXT,
  descripcion           TEXT NOT NULL,
  establecimiento_id    INTEGER,
  usuario_id            INTEGER,
  ubicacion_id          INTEGER,
  modelo_id             INTEGER,
  medida                TEXT,
  marca_id              INTEGER,
  estado_id             INTEGER,
  serie                 TEXT,
  color                 TEXT,
  caracteristicas       TEXT,
  fecha_mantenimiento   TEXT,
  tiempo_mantenimiento  TEXT,
  observaciones         TEXT,
  creado_en             TEXT NOT NULL DEFAULT (datetime('now')),
  actualizado_en        TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (establecimiento_id) REFERENCES establecimientos(id),
  FOREIGN KEY (usuario_id)         REFERENCES profesionales(id),
  FOREIGN KEY (ubicacion_id)       REFERENCES ubicaciones(id),
  FOREIGN KEY (modelo_id)          REFERENCES modelos(id),
  FOREIGN KEY (marca_id)           REFERENCES marcas(id),
  FOREIGN KEY (estado_id)          REFERENCES estados(id)
);

CREATE INDEX IF NOT EXISTS idx_bienes_cod_int ON bienes(codigo_interno);
CREATE INDEX IF NOT EXISTS idx_bienes_estab   ON bienes(establecimiento_id);

-- ============================================
-- HISTORIAL DE MOVIMIENTOS DE BIENES
-- ============================================
CREATE TABLE IF NOT EXISTS bienes_historial (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  bien_id        INTEGER NOT NULL,
  fecha          TEXT NOT NULL DEFAULT (datetime('now')),
  tipo_evento    TEXT NOT NULL,
  ubicacion_id   INTEGER,
  usuario_id     INTEGER,
  estado_id      INTEGER,
  observacion    TEXT,
  FOREIGN KEY (bien_id)      REFERENCES bienes(id) ON DELETE CASCADE,
  FOREIGN KEY (ubicacion_id) REFERENCES ubicaciones(id),
  FOREIGN KEY (usuario_id)   REFERENCES profesionales(id),
  FOREIGN KEY (estado_id)    REFERENCES estados(id)
);

CREATE INDEX IF NOT EXISTS idx_hist_bien ON bienes_historial(bien_id);

-- ============================================
-- ACTAS
-- ============================================
CREATE TABLE IF NOT EXISTS actas (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo                 TEXT NOT NULL CHECK (tipo IN ('ENTREGA','RECEPCION')),
  numero               TEXT NOT NULL UNIQUE,
  fecha                TEXT NOT NULL,
  entrega_id           INTEGER,
  recibe_id            INTEGER,
  encargado_id         INTEGER,
  establecimiento_id   INTEGER,
  observaciones        TEXT,
  estado               TEXT NOT NULL DEFAULT 'BORRADOR'
                       CHECK (estado IN ('BORRADOR','EMITIDA','ANULADA')),
  creado_en            TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (entrega_id)   REFERENCES profesionales(id),
  FOREIGN KEY (recibe_id)    REFERENCES profesionales(id),
  FOREIGN KEY (encargado_id) REFERENCES encargados(id)
);

CREATE TABLE IF NOT EXISTS actas_detalle (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  acta_id         INTEGER NOT NULL,
  bien_id         INTEGER NOT NULL,
  estado_entrega  TEXT,
  observacion     TEXT,
  FOREIGN KEY (acta_id) REFERENCES actas(id) ON DELETE CASCADE,
  FOREIGN KEY (bien_id) REFERENCES bienes(id)
);

-- ============================================
-- MÓDULO DE ALMACÉN (FUNGIBLES)
-- ============================================

-- Catálogo de suministros
CREATE TABLE IF NOT EXISTS suministros (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo            TEXT UNIQUE,
  descripcion       TEXT NOT NULL,
  unidad_medida     TEXT,
  stock_minimo      INTEGER NOT NULL DEFAULT 0,
  activo            INTEGER NOT NULL DEFAULT 1,
  creado_en         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Movimientos de almacén (ingresos / salidas)
CREATE TABLE IF NOT EXISTS almacen_movimientos (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  tipo                  TEXT NOT NULL CHECK (tipo IN ('INGRESO','SALIDA')),
  suministro_id         INTEGER NOT NULL,
  cantidad              INTEGER NOT NULL,
  establecimiento_id    INTEGER,
  ubicacion             TEXT,
  usuario_id            INTEGER,
  estado                TEXT,
  marca                 TEXT,
  color                 TEXT,
  modelo                TEXT,
  medidas               TEXT,
  fecha_ingreso         TEXT,
  fecha_salida          TEXT,
  observacion           TEXT,
  creado_en             TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (suministro_id)      REFERENCES suministros(id),
  FOREIGN KEY (establecimiento_id) REFERENCES establecimientos(id),
  FOREIGN KEY (usuario_id)         REFERENCES profesionales(id)
);

CREATE INDEX IF NOT EXISTS idx_almacen_suministro ON almacen_movimientos(suministro_id);
CREATE INDEX IF NOT EXISTS idx_almacen_tipo       ON almacen_movimientos(tipo);