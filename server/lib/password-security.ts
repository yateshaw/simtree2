import crypto from "crypto";

/**
 * Secure password hashing using PBKDF2 with a random salt
 * This implements industry standard password hashing with:
 * - Random salt generation for each password
 * - PBKDF2 key derivation with high iteration count
 * - SHA-256 for the hash function
 */
export async function hashPassword(password: string): Promise<string> {
  // Generate a random salt
  const salt = crypto.randomBytes(16).toString("hex");
  
  // Use PBKDF2 with 100000 iterations for strong security
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("hex");
  
  // Return the salt and hash together
  return salt + "." + hash;
}

/**
 * Verify a password against a stored hash
 * @param storedPassword The hash stored in the database (salt.hash format)
 * @param providedPassword The password provided during login
 */
export async function verifyPassword(storedPassword: string, providedPassword: string): Promise<boolean> {
  try {
    // Split the stored password into salt and hash - try both separators for compatibility
    let salt: string, storedHash: string;
    
    if (storedPassword.includes(":")) {
      // New format uses colon separator
      [salt, storedHash] = storedPassword.split(":");
    } else if (storedPassword.includes(".")) {
      // Old format uses dot separator
      [salt, storedHash] = storedPassword.split(".");
    } else {
      console.error("[Security] Invalid stored password format - no separator found");
      return false;
    }
    
    // If no salt or hash was found, the format is invalid
    if (!salt || !storedHash) {
      console.error("[Security] Invalid stored password format - missing salt or hash");
      return false;
    }
    
    // Hash the provided password with the same salt
    const hash = crypto.pbkdf2Sync(providedPassword, salt, 100000, 32, "sha256").toString("hex");
    
    // Time-constant comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(hash, "hex"), 
      Buffer.from(storedHash, "hex")
    );
  } catch (error) {
    console.error("[Security] Error verifying password:", error);
    return false;
  }
}

/**
 * Generate a secure random token (for reset tokens, API keys, etc.)
 * @param length Length of the token in bytes (will be twice this length as hex)
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString("hex");
}

/**
 * Generate a secure password for new users or reset
 * Creates passwords with mixed case, numbers, and special characters
 */
export function generateSecurePassword(length: number = 12): string {
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
  
  const allChars = lowercase + uppercase + numbers + special;
  
  let password = '';
  
  // Ensure we have at least one of each type
  password += lowercase.charAt(Math.floor(crypto.randomInt(lowercase.length)));
  password += uppercase.charAt(Math.floor(crypto.randomInt(uppercase.length)));
  password += numbers.charAt(Math.floor(crypto.randomInt(numbers.length)));
  password += special.charAt(Math.floor(crypto.randomInt(special.length)));
  
  // Fill the rest with random characters
  for (let i = 4; i < length; i++) {
    password += allChars.charAt(Math.floor(crypto.randomInt(allChars.length)));
  }
  
  // Shuffle the password
  return password.split('').sort(() => 0.5 - Math.random()).join('');
}