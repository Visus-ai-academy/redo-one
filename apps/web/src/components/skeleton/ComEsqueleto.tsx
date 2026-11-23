import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';
import { useFaseDoCarregamento } from './use-fase-do-carregamento';

/**
 * Bloco que espera dados: o lugar fica reservado desde o início (o skeleton, invisível), o
 * skeleton só aparece depois de ~200ms e, se apareceu, fica no mínimo ~400ms. `children` é uma
 * função, para só montar o conteúdo com os dados na mão.
 *
 * Ex.: `<ComEsqueleto carregando={!dados} esqueleto={<CamposCarregando />}>{() => <Form dados={dados!} />}</ComEsqueleto>`
 */
export function ComEsqueleto({
  carregando,
  esqueleto,
  children,
  className,
}: {
  carregando: boolean;
  esqueleto: ReactNode;
  children: () => ReactNode;
  className?: string;
}) {
  const fase = useFaseDoCarregamento(carregando);
  if (fase === 'conteudo') return children();
  return (
    <div aria-busy="true" className={cn(fase === 'reservado' && 'invisible', className)}>
      {esqueleto}
    </div>
  );
}
