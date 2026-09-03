/**
 * Bootstrap del primer administrador (§25.1).
 *
 *   pnpm admin:create --email tu@correo.com --name "Tu Nombre"
 *
 * Los datos van por argumento, no por variable de entorno: son de un solo uso y
 * no tienen por qué quedarse en la configuración del despliegue para siempre.
 * Se aceptan igualmente `BOOTSTRAP_ADMIN_EMAIL` y `BOOTSTRAP_ADMIN_NAME` para
 * automatizarlo desde un provisionador, pero no hacen falta.
 *
 * Existe porque hay un círculo que romper: los usuarios se dan de alta desde el
 * panel, y para entrar al panel hay que ser usuario. En una base vacía no hay
 * nadie.
 *
 * Falla si ya existe un administrador: no puede quedar como puerta trasera
 * permanente. Imprime la contraseña una sola vez y obliga a cambiarla al entrar.
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const TEMP_PASSWORD_HOURS = 72;

function generatePassword(length = 20): string {
  let out = '';
  for (let i = 0; i < length; i += 1) out += ALPHABET[randomInt(ALPHABET.length)];
  return out;
}

/** `--email tu@correo.com` o `--email=tu@correo.com`. */
function argumento(nombre: string): string | undefined {
  const args = process.argv.slice(2);
  const exacto = args.indexOf(`--${nombre}`);
  if (exacto !== -1 && args[exacto + 1] && !args[exacto + 1]?.startsWith('--')) {
    return args[exacto + 1];
  }
  const pegado = args.find((a) => a.startsWith(`--${nombre}=`));
  return pegado?.slice(nombre.length + 3);
}

async function main(): Promise<void> {
  const email = argumento('email') ?? process.env['BOOTSTRAP_ADMIN_EMAIL'];
  const fullName = argumento('name') ?? process.env['BOOTSTRAP_ADMIN_NAME'] ?? 'Administrador';

  if (!email) {
    throw new Error(
      'Falta el correo. Uso: pnpm admin:create --email tu@correo.com --name "Tu Nombre"',
    );
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new Error(`"${email}" no parece un correo válido`);
  }

  const prisma = new PrismaClient();
  try {
    const existing = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (existing) {
      throw new Error(
        `Ya existe un administrador (${existing.email}). Crea los demás desde el dashboard.`,
      );
    }

    const password = generatePassword();
    // Script de línea de comandos, fuera del dominio: aquí el reloj del sistema
    // es la única fuente disponible y no hay nada que testear con reloj fijo.
    // eslint-disable-next-line no-restricted-syntax
    const now = new Date();
    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        fullName,
        role: 'ADMIN',
        status: 'PENDING_ACTIVATION',
        passwordHash: await argon2.hash(password, {
          type: argon2.argon2id,
          memoryCost: 65_536,
          timeCost: 3,
          parallelism: 4,
        }),
        mustChangePassword: true,
        tempPasswordExpiresAt: new Date(now.getTime() + TEMP_PASSWORD_HOURS * 3_600_000),
      },
    });

    process.stdout.write(
      [
        '',
        'Administrador creado.',
        `  Correo:      ${user.email}`,
        `  Contraseña:  ${password}`,
        '',
        `Caduca en ${TEMP_PASSWORD_HOURS} h y debe cambiarse al primer acceso.`,
        'No vuelve a mostrarse: cópiala ahora.',
        '',
      ].join('\n'),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
