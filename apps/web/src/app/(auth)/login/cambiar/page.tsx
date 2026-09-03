import { AuthShell } from '@/features/auth/auth-shell';
import { ChangeInitialForm } from '@/features/auth/change-initial-form';

export const metadata = { title: 'Contraseña nueva · Pagarés' };

/**
 * Cambio obligatorio del primer acceso (§10.3, flujo 2).
 *
 * Sin este paso no hay acceso a ningún otro endpoint, así que la pantalla no
 * ofrece salida distinta de cambiarla o volver a empezar.
 */
export default function ChangeInitialPage() {
  return (
    <AuthShell
      title="Elige tu contraseña"
      description="La que te dieron es temporal y de un solo uso. En cuanto guardes la tuya entras al panel."
      footer={
        <p>
          Nadie más ve la contraseña que escribas aquí: se guarda cifrada con argon2id y ni el
          administrador puede leerla.
        </p>
      }
    >
      <ChangeInitialForm />
    </AuthShell>
  );
}
