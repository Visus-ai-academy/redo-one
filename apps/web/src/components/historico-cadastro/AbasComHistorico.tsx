import { type ReactNode, useState } from 'react';

import { Abas } from '../abas/Abas';

/**
 * Painel de cadastro com a aba Histórico por último. Sem `historico` (criando, ou sem conteúdo),
 * mostra só o cadastro, sem abas.
 */
export function AbasComHistorico({
  historico,
  'aria-label': ariaLabel,
  children,
}: {
  historico?: ReactNode;
  'aria-label': string;
  /** O cadastro (formulário e seções). */
  children: ReactNode;
}) {
  const [aba, setAba] = useState('cadastro');
  if (!historico) return children;
  return (
    <Abas
      aria-label={ariaLabel}
      valor={aba}
      onMudar={setAba}
      abas={[
        { valor: 'cadastro', rotulo: 'Cadastro' },
        { valor: 'historico', rotulo: 'Histórico' },
      ]}
      className="gap-0 pt-2"
    >
      {aba === 'historico' ? historico : children}
    </Abas>
  );
}
