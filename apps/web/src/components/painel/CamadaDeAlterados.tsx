import type { ReactNode } from 'react';

import { AlteradosDaAba, AlteradosDaCamada } from './fechamento';

/** Nova camada (painel, diálogo): o que se digita dentro conta só para ela, não para a aba de fora. */
export function CamadaDeAlterados({
  registrar,
  children,
}: {
  registrar: (chave: object, alterado: boolean) => void;
  children: ReactNode;
}) {
  return (
    <AlteradosDaCamada value={registrar}>
      <AlteradosDaAba value={undefined}>{children}</AlteradosDaAba>
    </AlteradosDaCamada>
  );
}
