import { listUsers } from '@/features/users/queries';
import { CreateUserForm, UserActions } from '@/features/users/user-forms';
import { dateTime } from '@/shared/lib/format';
import { DataTable, type Column } from '@/shared/ui/data-table';
import { ListPagination, paginate } from '@/shared/ui/list-pagination';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';

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
        description="Cuentas de acceso a la aplicación. No hay registro público: sólo se crean desde aquí."
      />

      <CreateUserForm />

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
function Origen({ user }: { user: UserRow }) {
  if (user.role === 'ADMIN') {
    return <span className="chip bg-surface-2 text-muted">Panel</span>;
  }

  /*
   * De la última sesión, no del registro de tokens de push.
   *
   * Ese registro sólo tiene filas cuando hay APNs configurado, así que la
   * columna decía «sin estrenar» de deudores que entraban todos los días. Y
   * cuando la app manda el modelo, se enseña el aparato en vez de la
   * plataforma: para soporte, «iPhone17,1 · iOS 26.5» ahorra media conversación
   * y «ios» no dice nada.
   */
  const ultimo = user.lastDevice;
  if (ultimo) {
    const aparato = [ultimo.model, ultimo.osVersion].filter(Boolean).join(' · ');
    /*
     * Sin plataforma no se dice «Navegador»: se dice que no consta.
     *
     * El servidor guarda lo que le mandan al entrar, y una aplicación que no
     * manda su aparato deja el campo vacío. Rellenarlo con «Navegador» era
     * inventar el dato —el deudor entraba desde el teléfono y la pantalla decía
     * lo contrario—, y ese es el peor error posible en una tabla que existe
     * para saber desde dónde entra cada quien (§24.3).
     */
    const desde =
      aparato ||
      (ultimo.platform === 'ios'
        ? 'iOS'
        : ultimo.platform === 'web'
          ? 'Navegador'
          : 'No informado');

    return (
      <span
        className={`chip ${
          ultimo.platform ? 'bg-accent-soft text-accent-ink' : 'bg-surface-2 text-muted'
        }`}
        title={
          ultimo.platform
            ? `Última entrada: ${dateTime(ultimo.at)}${
                ultimo.appVersion ? ` · app ${ultimo.appVersion}` : ''
              }`
            : `Última entrada: ${dateTime(ultimo.at)} · la aplicación no informó del aparato`
        }
      >
        {desde}
      </span>
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
