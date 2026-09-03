import Link from 'next/link';
import { AuthShell } from '@/features/auth/auth-shell';
import { LoginForm } from '@/features/auth/login-form';

export const metadata = { title: 'Acceso · Pagarés' };

/**
 * Acceso. Dos paneles en pantalla ancha: a la izquierda quién eres y qué se
 * guarda aquí, a la derecha el formulario. En móvil el panel de marca se
 * reduce a la cabecera —nadie escribe su contraseña haciendo scroll.
 */
export default function LoginPage() {
  return (
    <AuthShell
      title="Acceso"
      description="Panel del equipo de Créditos Morelia. Los clientes consultan y firman sus pagarés desde la aplicación, no desde aquí."
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
