/**
 * Password reset for a merchant, run by the app's operator:
 *   npx tsx scripts/reset-password.ts dueno@comercio.com "NuevaClave123"
 * Uses the same configuration as the server and closes the owner's open sessions.
 */
import dotenv from 'dotenv';
import { loadConfig } from '../server/config';
import { hashPassword } from '../server/security';
import { createStore } from '../server/store';

dotenv.config();

const [email, password] = process.argv.slice(2);
if (!email || !password || password.length < 8) {
  console.error('Uso: npx tsx scripts/reset-password.ts <email> <contraseña de 8 o más caracteres>');
  process.exit(1);
}

const store = await createStore(loadConfig());
const merchant = await store.findMerchantByEmail(email.trim().toLowerCase());
if (!merchant) {
  console.error('No existe un comercio con ese email.');
  process.exit(1);
}
await store.updateMerchant(merchant.id, {
  passwordHash: await hashPassword(password),
  ownerSessionVersion: merchant.ownerSessionVersion + 1,
});
console.log(`Contraseña actualizada para ${merchant.businessName}.`);
process.exit(0);
