import { createFileRoute } from '@tanstack/react-router';

import { NaoEncontrada } from '../../components/estado/estados';

// Endereço desconhecido para quem está logado: "Página não encontrada" dentro do layout, com o
// menu de pé (um notFound() subiria até a raiz e tiraria o menu). Sem sessão, a guarda do _app
// manda para o login antes, sem revelar o que existe.
export const Route = createFileRoute('/_app/$')({
  head: () => ({ meta: [{ title: 'Página não encontrada · One' }] }),
  component: NaoEncontrada,
});
