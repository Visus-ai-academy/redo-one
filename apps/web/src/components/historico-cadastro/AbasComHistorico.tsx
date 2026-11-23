import { type ReactNode, useState } from 'react';

import { Abas } from '../abas/Abas';

/** Aba além de Cadastro e Histórico (ex.: Distribuição), entre as duas. */
export type AbaExtra = { valor: string; rotulo: string; conteudo: ReactNode };

/**
 * Painel de cadastro com a aba Histórico por último e, entre as duas, as `extras`. Sem `historico`
 * (criando, ou sem conteúdo) e sem `extras`, mostra só o cadastro, sem abas.
 */
export function AbasComHistorico({
  historico,
  extras = [],
  'aria-label': ariaLabel,
  children,
}: {
  historico?: ReactNode;
  extras?: AbaExtra[];
  'aria-label': string;
  /** O cadastro (formulário e seções). */
  children: ReactNode;
}) {
  const [aba, setAba] = useState('cadastro');
  if (!historico && extras.length === 0) return children;
  const extra = extras.find((e) => e.valor === aba);
  return (
    <Abas
      aria-label={ariaLabel}
      valor={aba}
      onMudar={setAba}
      abas={[
        { valor: 'cadastro', rotulo: 'Cadastro' },
        ...extras.map(({ valor, rotulo }) => ({ valor, rotulo })),
        ...(historico ? [{ valor: 'historico', rotulo: 'Histórico' }] : []),
      ]}
      className="gap-0 pt-2"
    >
      {/* O cadastro fica montado (escondido) nas outras abas: voltar a ele não perde o digitado. */}
      <div hidden={aba !== 'cadastro'}>{children}</div>
      {aba === 'historico' && historico ? historico : extra?.conteudo}
    </Abas>
  );
}
