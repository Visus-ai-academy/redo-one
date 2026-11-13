import { createFileRoute, redirect } from '@tanstack/react-router';

import { destinoInicial } from '../../components/app-shell/destino-inicial';

export const Route = createFileRoute('/_app/')({
  beforeLoad: ({ context }) => {
    throw redirect({ to: destinoInicial(context.sessao) });
  },
});
