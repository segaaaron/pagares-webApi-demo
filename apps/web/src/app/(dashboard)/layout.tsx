import { redirect } from 'next/navigation';
import { readSession } from '@/shared/auth/session';
import { logoutAction } from '@/features/auth/actions';
import { NavIcon } from '@/shared/ui/icons/nav-icons';
import { NavLink } from './nav-link';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { ToastProvider } from '@/shared/ui/toast';

/**
 * Estructura del dashboard (§19.1): nueve destinos en tres grupos.
 *
 * El agrupado no es decoración: separa lo que se hace a diario de lo que se
 * consulta y de lo que casi nunca se toca. Sin él, "Cobranza" y "Reportes"
 * parecen lo mismo, y "Clientes" y "Usuarios" también —y no lo son:
 *
 *  · Deudores  = la gente que debe. No entra a ningún sitio.
 *  · Accesos   = las cuentas que entran a la aplicación.
 *  · Cobranza  = qué hay que hacer hoy para cobrar.
 *  · Reportes  = qué pasó, para exportarlo.
 *
 * Las etiquetas lo dicen y el subtítulo del grupo lo remata.
 */
const GROUPS = [
  {
    title: 'Operación',
    items: [
      { href: '/', label: 'Panel', hint: 'Qué hay que hacer ahora', icon: NavIcon.panel },
      { href: '/pagares', label: 'Pagarés', hint: 'La cartera completa, pagaré por pagaré', icon: NavIcon.notes },
      { href: '/cobranza', label: 'Cobranza', hint: 'A quién perseguir hoy: embudo, promesas y convenios', icon: NavIcon.collections },
      { href: '/avisos', label: 'Avisos', hint: 'Correos que no llegaron y su reenvío', icon: NavIcon.alert },
    ],
  },
  {
    title: 'Análisis',
    items: [
      { href: '/cartera', label: 'Cartera', hint: 'Saldo, antigüedad e indicadores', icon: NavIcon.portfolio },
      { href: '/reportes', label: 'Reportes', hint: 'Lo que ya pasó, para exportar', icon: NavIcon.reports },
    ],
  },
  {
    title: 'Directorio',
    items: [
      { href: '/clientes', label: 'Deudores', hint: 'Quién debe y cuánto', icon: NavIcon.clients },
      { href: '/usuarios', label: 'Accesos', hint: 'Cuentas que entran a la aplicación', icon: NavIcon.users },
      { href: '/ajustes', label: 'Ajustes', hint: 'Organización, folios y reglas', icon: NavIcon.settings },
    ],
  },
] as const;

const ROLES: Record<string, string> = { ADMIN: 'Administrador', CLIENT: 'Cliente' };

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await readSession();
  // La autorización se comprueba en el servidor. Ocultar el menú no sería control (§9.2).
  if (!session) redirect('/login');
  if (session.role !== 'ADMIN') redirect('/login');

  const name = session.who?.fullName ?? 'Administrador';
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <ToastProvider>
      <div className="flex min-h-dvh">
        <nav
          aria-label="Principal"
          className="sticky top-0 flex h-dvh w-64 shrink-0 flex-col border-r border-line bg-sidebar"
        >
          <div className="flex items-center gap-2.5 px-5 py-5">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-white" aria-hidden>
              <NavIcon.mark />
            </span>
            <p className="font-serif text-lg font-semibold leading-none text-ink">Pagarés</p>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-2">
            {GROUPS.map((group) => (
              <div key={group.title} className="mb-5">
                <p className="mb-1.5 px-2.5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
                  {group.title}
                </p>
                <ul className="space-y-1">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <NavLink href={item.href} hint={item.hint}>
                        <item.icon />
                        {item.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>

          {/* Quién está dentro y con qué papel: la pregunta que uno se hace
              antes de tocar nada en una herramienta con varias manos. */}
          <div className="border-t border-line p-3">
            <div className="flex items-center gap-2.5 px-1.5 py-1">
              <span
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent-ink"
                aria-hidden
              >
                {initials || 'A'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink">{name}</span>
                <span className="block truncate text-xs text-muted">
                  {ROLES[session.role] ?? session.role}
                  {session.who ? ` · ${session.who.email}` : ''}
                </span>
              </span>
            </div>

            <form action={logoutAction} className="mt-1.5">
              <ConfirmDialog
                title="¿Cerrar sesión?"
                description="Se cerrará la sesión en este navegador. Tendrás que volver a entrar con tu correo y contraseña."
                confirmLabel="Cerrar sesión"
              >
                <NavIcon.logout />
                Cerrar sesión
              </ConfirmDialog>
            </form>

            <p className="mt-2 px-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
              Admin console · v1
            </p>
          </div>
        </nav>

        <main className="min-w-0 flex-1 px-8 py-6">{children}</main>
      </div>
    </ToastProvider>
  );
}
