import type { ReactNode } from 'react';

import { cn } from '../../lib/cn';

/**
 * Campos lado a lado numa linha do formulário. Cada campo ocupa as linhas da grade (rótulo,
 * controle, descrição, erro) por subgrid: os controles ficam alinhados entre si mesmo quando um
 * rótulo quebra linha, e as descrições começam na mesma altura. Sem espaço, os campos descem para
 * a linha de baixo (colunas iguais de no mínimo 176px).
 *
 * Colunas de larguras diferentes: `className` com o modelo a partir de uma largura do pai, ex.:
 * `@md:grid-cols-[3fr_1fr]` (o pai é o container). Algo que não é campo (aviso, texto) leva
 * `col-span-full` e ocupa a linha inteira.
 */
export function LinhaDeCampos({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className="@container">
      <div className={cn('linha-de-campos', className)}>{children}</div>
    </div>
  );
}
