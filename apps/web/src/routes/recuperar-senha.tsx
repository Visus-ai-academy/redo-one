import { createFileRoute } from '@tanstack/react-router';

import { AcessoLayout } from '../components/acesso/AcessoLayout';
import { RecuperarSenhaForm } from '../components/acesso/RecuperarSenhaForm';

export const Route = createFileRoute('/recuperar-senha')({
  head: () => ({ meta: [{ title: 'Recuperar senha | One' }] }),
  component: RecuperarSenha,
});

function RecuperarSenha() {
  return (
    <AcessoLayout>
      <RecuperarSenhaForm />
    </AcessoLayout>
  );
}
