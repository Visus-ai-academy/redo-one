import { Button } from '@base-ui/react/button';
import { type ReactNode, useContext } from 'react';

import { buttonClassName } from '../button/button-class';
import { PedirFechamento } from './fechamento';

/**
 * "Cancelar" de um formulário dentro de `PainelLateral` ou `Dialogo`: fecha pelo mesmo caminho do
 * X (animação e pergunta de descartar, se houver alteração). Fora de uma camada, chama `onCancelar`.
 */
export function BotaoCancelar({
  onCancelar,
  children = 'Cancelar',
}: {
  onCancelar: () => void;
  children?: ReactNode;
}) {
  const pedirFechamento = useContext(PedirFechamento);
  return (
    <Button
      type="button"
      onClick={pedirFechamento ?? onCancelar}
      className={buttonClassName({ variant: 'secondary' })}
    >
      {children}
    </Button>
  );
}
