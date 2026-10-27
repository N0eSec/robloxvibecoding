// Crea el .env a partir de .env.example. Funciona igual en Windows, Mac y Linux.
import { copyFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from '../server/config.js';

const target = resolve(ROOT, '.env');

if (existsSync(target)) {
  console.log('\n  Ya tienes un .env, no lo toco.');
  console.log('  Si quieres empezar de cero, bórralo y vuelve a ejecutar: npm run setup\n');
} else {
  copyFileSync(resolve(ROOT, '.env.example'), target);
  console.log(`\n  ✅ .env creado en ${target}`);
  console.log('  Ya trae tu PLACE_ID. Ábrelo con el Bloc de notas para lo demás.\n');
}
console.log('  Siguiente paso:  npm run check\n');
