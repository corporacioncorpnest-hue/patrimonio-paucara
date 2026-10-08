-- ============================================
-- SEED: Datos iniciales del sistema
-- Sistema de Patrimonio - Micro Red Paucará
-- ============================================

-- ============================================
-- ESTADOS DE BIENES
-- ============================================
INSERT OR IGNORE INTO estados (nombre,color) VALUES
  ('BUENO','#22c55e'),
  ('REGULAR','#eab308'),
  ('MALO','#ef4444'),
  ('NUEVO','#3b82f6'),
  ('CHATARRA','#6b7280'),
  ('SIN MEDIDA','#a3a3a3');

-- ============================================
-- TIPOS DE INVENTARIO
-- ============================================
INSERT OR IGNORE INTO tipos_inventario (nombre) VALUES
  ('ACTIVO'),
  ('SOBRANTE'),
  ('FALTANTE'),
  ('BIENES FUNGIBLES');

-- ============================================
-- UBICACIONES FÍSICAS (Servicios MINSA Perú)
-- ============================================
INSERT OR IGNORE INTO ubicaciones (nombre) VALUES
  ('ADMISIÓN'),('CAJA'),('ARCHIVO'),('TRIAJE'),('TÓPICO'),('EMERGENCIA'),
  ('CONSULTORIO MEDICINA GENERAL'),('CONSULTORIO OBSTETRICIA'),
  ('CONSULTORIO ODONTOLOGÍA'),('CONSULTORIO NUTRICIÓN'),
  ('CONSULTORIO PSICOLOGÍA'),('CONSULTORIO ENFERMERÍA'),
  ('CONSULTORIO CRED - NIÑO'),('CONSULTORIO CRED - ADULTO'),
  ('CONSULTORIO PLANIFICACIÓN FAMILIAR'),('CONSULTORIO INMUNIZACIONES'),
  ('SALA DE PARTOS'),('SALA DE HOSPITALIZACIÓN'),('SALA DE OBSERVACIÓN'),
  ('LABORATORIO CLÍNICO'),('FARMACIA'),('ALMACÉN GENERAL'),
  ('ALMACÉN DE MEDICAMENTOS'),('ESTERILIZACIÓN (CEYE)'),('RAYOS X'),
  ('ECOGRAFÍA'),('TERAPIA FÍSICA'),('SANITARIOS DAMAS'),
  ('SANITARIOS VARONES'),('PASADIZO'),('OFICINA DE DIRECCIÓN'),
  ('OFICINA DE ADMINISTRACIÓN'),('OFICINA DE ESTADÍSTICA E INFORMÁTICA'),
  ('OFICINA DE PATRIMONIO'),('OFICINA DE RECURSOS HUMANOS'),
  ('OFICINA DE SEGUROS'),('SALA DE ESPERA'),('SALA DE REUNIONES'),
  ('PUERTA DE ENTRADA / HALL'),('AZOTEA'),('PATIO'),('GARITA DE VIGILANCIA');

-- ============================================
-- MARCAS
-- ============================================
INSERT OR IGNORE INTO marcas (nombre) VALUES
  ('ELISE'),('EPSON'),('DELL'),('HP'),('LENOVO'),('SIN MODELO');

-- ============================================
-- USUARIO ADMIN (acceso global, sin establecimiento)
-- Usuario: admin / Contraseña: admin123
-- ============================================
INSERT OR IGNORE INTO usuarios (username,password_hash,nombre_completo,rol,establecimiento_id)
VALUES (
  'admin',
  '$2a$12$w2k38J74FOG3hmq4FxKA3uRN28303maiZSHbXOFzcrwUs.ZL6S8FC',
  'Administrador del Sistema',
  'admin',
  NULL
);