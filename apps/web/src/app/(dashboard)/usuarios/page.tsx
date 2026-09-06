import { listUsers } from '@/features/users/queries';
import { UserActions } from '@/features/users/user-forms';
import { dateTime } from '@/shared/lib/format';
import { DataTable, type Column } from '@/shared/ui/data-table';
import { ListPagination, paginate } from '@/shared/ui/list-pagination';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { NavIcon } from '@/shared/ui/icons/nav-icons';

export const metadata = { title: 'Accesos' };

const STATUS: Record<string, { label: string; chip: string }> = {
  PENDING_ACTIVATION: { label: 'Pendiente', chip: 'bg-warn-soft text-warn' },
  ACTIVE: { label: 'Activa', chip: 'bg-ok-soft text-ok' },
  SUSPENDED: { label: 'Suspendida', chip: 'bg-crit-soft text-crit' },
  DISABLED: { label: 'Deshabilitada', chip: 'bg-surface-2 text-muted' },
};

type UserRow = Awaited<ReturnType<typeof listUsers>>[number];

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams(
    Object.entries(await searchParams).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v] as [string, string]] : [])),
  );
  const users = await listUsers();
  const now = Date.now();
  const { page, props } = paginate(users, params);

  const isLocked = (user: UserRow): boolean =>
    user.lockedUntil !== null && Date.parse(user.lockedUntil) > now;

  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: 'Nombre',
      cell: (user) => (
        <span className="flex items-center gap-2">
          <span className="font-medium text-ink">{user.fullName}</span>
          {user.role === 'ADMIN' ? <span className="chip bg-accent-soft text-accent-ink">Admin</span> : null}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Correo',
      cell: (user) => <span className="text-ink-2">{user.email}</span>,
    },
    {
      key: 'status',
      header: 'Estado',
      width: '13rem',
      cell: (user) => {
        const status = STATUS[user.status] ?? STATUS.DISABLED!;
        return (
          <span className="block">
            <span className={`chip ${status.chip}`}>{status.label}</span>
            {isLocked(user) ? (
              <span className="mt-1 block text-xs text-crit">
                Bloqueada hasta {dateTime(user.lockedUntil!)}
              </span>
            ) : null}
            {user.mustChangePassword ? (
              <span className="mt-1 block text-xs text-muted">Debe cambiar su contraseña</span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: 'desde',
      header: 'Entra desde',
      width: '10rem',
      cell: (user) => <Origen user={user} />,
    },
    {
      key: 'notes',
      header: 'Pagarés',
      align: 'right',
      width: '6rem',
      cell: (user) => <span className="tnum">{user.notesCount}</span>,
    },
    {
      key: 'last',
      header: 'Último acceso',
      width: '11rem',
      cell: (user) => (
        <span className="text-xs text-muted">{user.lastLoginAt ? dateTime(user.lastLoginAt) : 'Nunca'}</span>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      align: 'right',
      width: '17rem',
      cell: (user) =>
        user.role === 'ADMIN' ? (
          // Un admin no se suspende desde aquí: sería la forma más fácil de
          // quedarse sin ninguno (§10).
          <span className="text-xs text-muted" title="Las cuentas de administrador no se gestionan desde esta lista">
            —
          </span>
        ) : (
          <UserActions
            userId={user.id}
            status={user.status}
            locked={isLocked(user)}
            fullName={user.fullName}
            notesCount={user.notesCount}
          />
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: 'Accesos' }]}
        title="Accesos"
        description="Cuentas de acceso a la aplicación. No hay registro público, y no se crean aquí: el acceso se da desde la ficha del deudor, porque una cuenta sin deudor no puede consultar nada."
      />


      <DataTable
        caption="Cuentas de acceso con su estado y su última entrada"
        columns={columns}
        rows={page}
        rowKey={(user) => user.id}
        empty={<EmptyState title="No hay cuentas todavía" hint="Da de alta la primera con el formulario de arriba." />}
        footer={
          <ListPagination
            basePath="/usuarios"
            params={params}
            shown={page.length}
            noun={['cuenta', 'cuentas']}
            {...props}
          />
        }
      />
    </div>
  );
}

/**
 * Desde dónde trabaja cada cuenta.
 *
 * El administrador vive en el panel y el deudor en la aplicación: verlos
 * idénticos en la lista invita a confundirlos y a reventar el acceso de alguien
 * creyendo que era del otro tipo. La plataforma la registra el propio inicio de
 * sesión, así que esto no pregunta nada: enseña lo que ya ocurrió.
 */
/**
 * La marca del aparato, deducida de lo que manda cada plataforma.
 *
 * Apple manda su identificador interno —`iPhone18,1`—, que es a la vez marca y
 * modelo. Android manda el fabricante y el modelo, y el modelo suele ser un
 * código —`SM-G991B`— que no dice nada sin traducir.
 *
 * Aquí se reconoce sólo la marca, que es lo que la columna contesta. El modelo
 * exacto se guarda y se enseña donde de verdad hace falta: en la evidencia de
 * firma del pagaré y en su PDF, que es donde alguien pregunta desde qué aparato
 * se firmó.
 */
function marcaDelAparato(model: string): string | null {
  const limpio = model.replace(/\s*\((simulador|simulator)\)\s*/i, '').trim();
  if (!limpio) return null;

  // Apple: el identificador empieza por la familia.
  if (/^iPhone/i.test(limpio)) return 'iPhone';
  if (/^iPad/i.test(limpio)) return 'iPad';
  if (/^Watch/i.test(limpio)) return 'Apple Watch';
  if (/^(Mac|arm64|x86_64)/i.test(limpio)) return 'Mac';

  // Android: por el código del modelo cuando el fabricante no viene delante.
  if (/^SM-|^GT-|^samsung/i.test(limpio)) return 'Samsung';
  if (/^Pixel|^google/i.test(limpio)) return 'Google';
  if (/^(Redmi|POCO|Mi\s|M20|2\d{5}|xiaomi)/i.test(limpio)) return 'Xiaomi';
  if (/^(moto|XT\d)/i.test(limpio)) return 'Motorola';
  if (/^(CPH|oneplus|realme|oppo)/i.test(limpio)) return 'OnePlus';
  if (/^(LM-|lg)/i.test(limpio)) return 'LG';
  if (/^(ANE|ELE|huawei|honor)/i.test(limpio)) return 'Huawei';

  // Lo habitual en Android es «Fabricante Modelo»: la marca es la primera
  // palabra, y si es un código suelto se enseña tal cual antes que inventar.
  const primera = limpio.split(/[\s-]/)[0] ?? limpio;
  return primera.charAt(0).toUpperCase() + primera.slice(1);
}

/** Cómo se llama la plataforma en la pantalla. */
const PLATAFORMA: Record<string, string> = {
  ios: 'iOS',
  android: 'Android',
  web: 'Navegador',
};

/**
 * Una fila de la columna: icono, de dónde entra y el detalle debajo.
 *
 * Todas las filas se ven igual —el administrador y el deudor— porque la columna
 * contesta lo mismo para los dos. Antes el admin llevaba píldora y el deudor
 * texto suelto, y dos formas distintas para el mismo dato invitan a leerlas como
 * si dijeran cosas distintas.
 */
function Aparato({
  icono,
  principal,
  detalle,
  apagado = false,
  title,
}: {
  icono: React.ReactNode;
  principal: string;
  detalle?: string | undefined;
  apagado?: boolean;
  title?: string | undefined;
}) {
  return (
    <span className="flex min-w-0 items-start gap-1.5" title={title}>
      <span className={`mt-0.5 shrink-0 ${apagado ? 'text-muted' : 'text-accent'}`}>{icono}</span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={`truncate text-sm ${apagado ? 'text-muted' : 'text-ink'}`}>
          {principal}
        </span>
        {detalle ? <span className="truncate text-xs text-muted">{detalle}</span> : null}
      </span>
    </span>
  );
}

function Origen({ user }: { user: UserRow }) {
  if (user.role === 'ADMIN') {
    return <Aparato icono={<NavIcon.monitor />} principal="Panel" apagado title="Trabaja desde el panel de administración" />;
  }

  /*
   * De la última sesión, no del registro de tokens de push.
   *
   * Ese registro sólo tiene filas cuando hay APNs configurado, así que la
   * columna decía «sin estrenar» de deudores que entraban todos los días.
   */
  const ultimo = user.lastDevice;
  if (ultimo) {
    const esSimulador = /simulador|simulator/i.test(ultimo.model ?? '');
    const marca = ultimo.model ? marcaDelAparato(ultimo.model) : null;

    /*
     * Sin plataforma no se dice «Navegador»: se dice que no consta.
     *
     * El servidor guarda lo que le mandan al entrar, y una aplicación que no
     * manda su aparato deja el campo vacío. Rellenarlo con «Navegador» era
     * inventar el dato —el deudor entraba desde el teléfono y la pantalla decía
     * lo contrario—, y ese es el peor error posible en una tabla que existe
     * para saber desde dónde entra cada quien (§24.3).
     */
    const plataforma = ultimo.platform ? (PLATAFORMA[ultimo.platform] ?? ultimo.platform) : null;

    return (
      <Aparato
        icono={ultimo.platform === 'web' ? <NavIcon.monitor /> : <NavIcon.mobile />}
        principal={[plataforma, marca].filter(Boolean).join(' · ') || 'No informado'}
        detalle={
          [ultimo.osVersion, esSimulador ? 'simulador' : null].filter(Boolean).join(' · ') ||
          undefined
        }
        apagado={!plataforma}
        title={`Última entrada: ${dateTime(ultimo.at)}${
          ultimo.appVersion ? ` · app ${ultimo.appVersion}` : ''
        }`}
      />
    );
  }

  const plataformas = [...new Set(user.devices.map((d) => d.platform))];
  if (plataformas.length === 0) {
    return (
      <span className="chip bg-surface-2 text-muted" title="Todavía no ha entrado desde ningún dispositivo">
        Sin estrenar
      </span>
    );
  }

  // Las cuentas de cliente sólo sirven en la aplicación: el panel les cierra la
  // puerta por rol. Cualquier plataforma que no sea una app es un dato viejo o
  // un intento fallido, y se nombra como lo que es.
  const NOMBRES: Record<string, string> = { ios: 'iOS', web: 'Sin app' };
  return (
    <span className="flex flex-wrap gap-1">
      {plataformas.map((p) => (
        <span key={p} className="chip bg-accent-soft text-accent-ink">
          {NOMBRES[p] ?? p}
        </span>
      ))}
    </span>
  );
}
