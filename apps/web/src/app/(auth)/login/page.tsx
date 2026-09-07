import Link from 'next/link';
import { AuthShell } from '@/features/auth/auth-shell';
import { LoginForm } from '@/features/auth/login-form';
import { organizationIdentity } from '@/features/auth/identity';

export const metadata = { title: 'Acceso · Pagarés' };

/**
 * Acceso. Dos paneles en pantalla ancha: a la izquierda quién eres y qué se
 * guarda aquí, a la derecha el formulario. En móvil el panel de marca se
 * reduce a la cabecera —nadie escribe su contraseña haciendo scroll.
 */
export default async function LoginPage() {
  // El nombre sale de Ajustes, como en el resto del panel: escribirlo aquí lo
  // dejaba anunciando a otra empresa en cuanto se cambiaba la razón social.
  const { legalName } = await organizationIdentity();

  return (
    <AuthShell
      title="Acceso"
      description={`Panel del equipo de ${legalName}. Los clientes consultan y firman sus pagarés desde la aplicación, no desde aquí.`}
      footer={
        <p>
          ¿Olvidaste la contraseña?{' '}
          <Link href="/login/recuperar" className="underline">
            Recupérala con un código
          </Link>{' '}
          que te llega al correo de la cuenta.
        </p>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
