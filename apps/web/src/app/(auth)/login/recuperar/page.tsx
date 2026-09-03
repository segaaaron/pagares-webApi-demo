import { AuthShell } from '@/features/auth/auth-shell';
import { RecoverForm } from '@/features/auth/recover-form';

export const metadata = { title: 'Recuperar la contraseña · Pagarés' };

/** Olvido de contraseña con código al correo (§10.3, flujo 4). */
export default function RecoverPage() {
  return (
    <AuthShell
      title="Recuperar la contraseña"
      description="Te mandamos un código de seis dígitos al correo de la cuenta y con él eliges una nueva."
      footer={
        <p>
          Cambiarla cierra todas las sesiones abiertas. Si no recibes el código, un administrador
          puede generarte una contraseña temporal.
        </p>
      }
    >
      <RecoverForm />
    </AuthShell>
  );
}
