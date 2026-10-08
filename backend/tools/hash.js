import bcrypt from 'bcryptjs';

const pwd = process.argv[2] || 'admin123';

console.log('');
console.log('═══════════════════════════════════════════════');
console.log('  🔐 Generador de Hash bcrypt');
console.log('═══════════════════════════════════════════════');
console.log('  Contraseña:', pwd);
console.log('  Hash:', bcrypt.hashSync(pwd, 12));
console.log('═══════════════════════════════════════════════');
console.log('');
console.log('  💡 Copia el hash y pégalo en backend/seed.sql');
console.log('     en el campo password_hash del usuario admin.');
console.log('');