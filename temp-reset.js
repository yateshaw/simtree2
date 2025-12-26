const { createHash, pbkdf2Sync, randomBytes } = require('crypto');

// Generate secure password hash using PBKDF2 (matching the system's method)
function hashPassword(password) {
  const salt = randomBytes(32).toString('hex');
  const hash = pbkdf2Sync(password, salt, 100000, 64, 'sha256').toString('hex');
  return salt + ':' + hash;
}

const newPasswordHash = hashPassword('Admin$123');
console.log("UPDATE users SET password = '" + newPasswordHash + "' WHERE email = 'yateshaw@gmail.com';");
