import bcrypt from 'bcryptjs';
const ok = bcrypt.compareSync('admin123', '$2a$12$w2k38J74FOG3hmq4FxKA3uRN28303maiZSHbXOFzcrwUs.ZL6S8FC');
console.log('Verificación del hash:', ok ? '✅ CORRECTO' : '❌ INCORRECTO');
