/**
 * Datos de demostración. Doce pagarés repartidos por todos los estados —incluidos
 * vencido, castigado y anulado— para que el dashboard nunca se pruebe vacío y los
 * filtros de cada pestaña tengan algo que mostrar.
 */
import { PrismaClient, type NoteStatus } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();
const HOY = new Date();

function fecha(diasDesdeHoy: number): Date {
  const d = new Date(HOY);
  d.setUTCDate(d.getUTCDate() + diasDesdeHoy);
  return new Date(d.toISOString().slice(0, 10) + 'T00:00:00Z');
}

const DEUDORES = [
  { fullName: 'Juan Pérez Ramírez', address: 'Av. Madero 412, Centro', phone: '+524431112233', email: 'juan.perez@ejemplo.mx' },
  { fullName: 'María López Guzmán', address: 'Calz. Ventura Puente 88', phone: '+524432223344', email: 'maria.lopez@ejemplo.mx' },
  // Sin correo: firmará presencialmente y sus avisos son gestión manual (§25.12).
  { fullName: 'Roberto Sánchez Díaz', address: 'Prol. Corregidora 1500', phone: '+524433334455', email: null },
];

interface Plantilla {
  status: NoteStatus;
  amount: bigint;
  paid: bigint;
  vence: number;
  deudor: number;
  tasa: number | null;
}

const PAGARES: Plantilla[] = [
  { status: 'PENDING_SIGNATURE', amount: 1_500_000n, paid: 0n, vence: 30, deudor: 0, tasa: 24 },
  { status: 'ISSUED', amount: 2_500_000n, paid: 0n, vence: 25, deudor: 0, tasa: 24 },
  { status: 'ISSUED', amount: 800_000n, paid: 0n, vence: 5, deudor: 1, tasa: null },
  { status: 'PARTIALLY_PAID', amount: 5_000_000n, paid: 2_000_000n, vence: 15, deudor: 1, tasa: 18 },
  { status: 'PARTIALLY_PAID', amount: 3_000_000n, paid: 500_000n, vence: 3, deudor: 2, tasa: 36 },
  { status: 'OVERDUE', amount: 1_200_000n, paid: 0n, vence: -12, deudor: 0, tasa: 24 },
  { status: 'OVERDUE', amount: 4_500_000n, paid: 1_000_000n, vence: -45, deudor: 1, tasa: 30 },
  { status: 'OVERDUE', amount: 900_000n, paid: 0n, vence: -95, deudor: 2, tasa: 24 },
  { status: 'PAID', amount: 2_000_000n, paid: 2_000_000n, vence: -60, deudor: 0, tasa: 24 },
  { status: 'PAID', amount: 600_000n, paid: 600_000n, vence: -20, deudor: 1, tasa: null },
  { status: 'WRITTEN_OFF', amount: 7_000_000n, paid: 500_000n, vence: -400, deudor: 2, tasa: 36 },
  { status: 'VOID', amount: 1_000_000n, paid: 0n, vence: 10, deudor: 0, tasa: 24 },
];

async function main(): Promise<void> {
  await prisma.organizationSettings.upsert({
    where: { id: 'singleton' },
    create: {
      id: 'singleton',
      legalName: 'Créditos Morelia S.A. de C.V.',
      address: 'Av. Camelinas 1200, Morelia, Michoacán',
      phone: '+524433000000',
      email: 'contacto@creditosmorelia.mx',
      defaultIssuePlace: 'Morelia, Michoacán',
      defaultPaymentPlace: 'Morelia, Michoacán',
      bankName: 'BBVA',
      bankAccount: '0123456789',
      bankClabe: '012470001234567890',
      paymentReference: 'Usa tu folio como referencia',
    },
    update: {},
  });

  const passwordHash = await argon2.hash('Demo-Pagares-2026', {
    type: argon2.argon2id,
    memoryCost: 65_536,
    timeCost: 3,
    parallelism: 4,
  });

  const admin = await prisma.user.upsert({
    where: { email: 'admin@pagares.local' },
    create: {
      email: 'admin@pagares.local',
      fullName: 'Administrador Demo',
      role: 'ADMIN',
      status: 'ACTIVE',
      passwordHash,
      mustChangePassword: false,
    },
    update: {},
  });

  const deudores = [];
  for (const d of DEUDORES) {
    const user = d.email
      ? await prisma.user.upsert({
          where: { email: d.email },
          create: {
            email: d.email,
            fullName: d.fullName,
            phone: d.phone,
            role: 'CLIENT',
            status: 'ACTIVE',
            passwordHash,
            mustChangePassword: false,
            createdByAdminId: admin.id,
          },
          update: {},
        })
      : null;

    /*
     * Idempotente por teléfono: `pnpm db:seed` se ejecuta más de una vez —al
     * volver a un entorno, tras tocar el esquema, al enseñar el sistema— y con
     * un `create` a secas la segunda vez moría con "Unique constraint failed on
     * the fields: (userId)", dejando la base a medio sembrar.
     */
    const existente = await prisma.debtor.findFirst({ where: { phone: d.phone } });

    deudores.push(
      existente
        ? await prisma.debtor.update({
            where: { id: existente.id },
            data: {
              fullName: d.fullName,
              address: d.address,
              email: d.email,
              userId: user?.id ?? null,
            },
          })
        : await prisma.debtor.create({
            data: {
              fullName: d.fullName,
              address: d.address,
              phone: d.phone,
              email: d.email,
              userId: user?.id ?? null,
            },
          }),
    );
  }

  const año = new Date().getUTCFullYear();
  await prisma.documentSequence.upsert({
    where: { type_year: { type: 'NOTE', year: año } },
    create: { type: 'NOTE', year: año, lastValue: 0 },
    update: {},
  });

  let folio = 0;
  for (const p of PAGARES) {
    folio += 1;
    const deudor = deudores[p.deudor]!;
    const vence = fecha(p.vence);
    const emite = fecha(p.vence - 30);

    // El folio de demostración es determinista, así que sirve de clave para no
    // duplicar la cartera de muestra al repetir el seed.
    const folioDemo = `PAG-${año}-${String(folio).padStart(6, '0')}`;
    const yaSembrado = await prisma.promissoryNote.findUnique({ where: { folio: folioDemo } });
    if (yaSembrado) continue;

    await prisma.promissoryNote.create({
      data: {
        folio: folioDemo,
        publicToken: `demo${String(folio).padStart(28, '0')}`,
        status: p.status,
        portfolioClass: p.vence <= -90 ? 'VENCIDA' : 'VIGENTE',
        agingBucket:
          p.vence >= 0 ? 'CURRENT' : p.vence >= -30 ? 'D1_30' : p.vence >= -60 ? 'D31_60' : p.vence >= -90 ? 'D61_90' : 'D120_PLUS',
        daysOverdue: p.vence < 0 ? Math.abs(p.vence) : 0,
        issuePlace: 'Morelia, Michoacán',
        issueDate: emite,
        paymentPlace: 'Morelia, Michoacán',
        dueDate: vence,
        prescribesOn: fecha(p.vence + 3 * 365),
        creditorName: 'Créditos Morelia S.A. de C.V.',
        amountCents: p.amount,
        paidCents: p.paid,
        currency: 'MXN',
        amountInWords: 'IMPORTE EN LETRA DE DEMOSTRACIÓN',
        interestRateAnnualPct: p.tasa,
        debtorId: deudor.id,
        ownerId: deudor.userId,
        createdBy: admin.id,
        acceptedAt: p.status === 'PENDING_SIGNATURE' ? null : emite,
        voidedAt: p.status === 'VOID' ? emite : null,
        voidReason: p.status === 'VOID' ? 'Emitido por error de captura' : null,
        voidedBy: p.status === 'VOID' ? admin.id : null,
        writtenOffAt: p.status === 'WRITTEN_OFF' ? fecha(-90) : null,
        writeOffReason: p.status === 'WRITTEN_OFF' ? 'Incobrable tras gestión agotada' : null,
        writtenOffBy: p.status === 'WRITTEN_OFF' ? admin.id : null,
        ...(p.paid > 0n
          ? {
              payments: {
                create: {
                  amountCents: p.paid,
                  appliedToPrincipalCents: p.paid,
                  paidOn: fecha(p.vence - 10),
                  method: 'TRANSFER' as const,
                  reference: 'DEMO-001',
                  registeredBy: admin.id,
                },
              },
            }
          : {}),
      },
    });
  }

  /*
   * La secuencia se adelanta, nunca retrocede: si ya se emitieron pagarés
   * reales por encima del último de demostración, bajarla repartiría folios
   * repetidos, que es lo único que un folio no puede hacer (§25.3).
   */
  const secuencia = await prisma.documentSequence.findUniqueOrThrow({
    where: { type_year: { type: 'NOTE', year: año } },
  });
  if (secuencia.lastValue < folio) {
    await prisma.documentSequence.update({
      where: { type_year: { type: 'NOTE', year: año } },
      data: { lastValue: folio },
    });
  }

  /*
   * Reglas de recordatorio por defecto (§13.1).
   *
   * Van en el seed y no en una migración porque son configuración, no esquema:
   * el administrador las edita en Ajustes. Pero sin ninguna regla el botón de
   * "enviar recordatorio" no tiene plantilla que usar y contesta que no aplica
   * ninguna, que es un arranque en falso difícil de diagnosticar.
   */
  const REGLAS = [
    { offsetDays: -7, templateId: 'due-reminder' },
    { offsetDays: -1, templateId: 'due-reminder' },
    { offsetDays: 0, templateId: 'due-reminder' },
    { offsetDays: 1, templateId: 'overdue-notice' },
    { offsetDays: 7, templateId: 'overdue-notice' },
    { offsetDays: 15, templateId: 'overdue-notice' },
    { offsetDays: 30, templateId: 'overdue-notice' },
  ] as const;

  for (const regla of REGLAS) {
    await prisma.reminderRule.upsert({
      where: { offsetDays_channel: { offsetDays: regla.offsetDays, channel: 'EMAIL' } },
      create: { offsetDays: regla.offsetDays, channel: 'EMAIL', templateId: regla.templateId },
      update: { templateId: regla.templateId },
    });
  }

  process.stdout.write(
    `\nSeed listo: ${DEUDORES.length} deudores, ${PAGARES.length} pagarés y ${REGLAS.length} reglas de aviso.\n` +
      `Administrador: admin@pagares.local / Demo-Pagares-2026\n\n`,
  );
}

main()
  .catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
