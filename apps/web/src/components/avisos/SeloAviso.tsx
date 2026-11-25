import { Warning } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';

import type { SeloAvisoDto } from '../../gen/types/SeloAvisoDto';
import { cn } from '../../lib/cn';
import { Dica } from '../dica/Dica';

/**
 * Selo de "aviso pendente" num item de lista ou painel (cliente, médico, exame, preço...): leva ao
 * aviso (ou, com mais de um, à lista dos avisos do item). Os avisos vêm de `useSelosDeAviso`, uma
 * consulta por página.
 */
export function SeloAviso({
  avisos,
  entidade,
  className,
}: {
  avisos: readonly SeloAvisoDto[] | undefined;
  /** A entidade do item, como na consulta (`cliente`, `preco_cliente`...). */
  entidade: string;
  className?: string;
}) {
  const [primeiro] = avisos ?? [];
  if (!avisos || !primeiro) return null;
  const um = avisos.length === 1;
  const nome = um ? `Aviso pendente: ${primeiro.valor}` : `${avisos.length} avisos pendentes`;
  const classe = cn(
    'bg-warning-soft text-warning focus-visible:outline-ring inline-flex flex-none items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap hover:underline focus-visible:outline-2',
    className,
  );
  const conteudo = (
    <>
      <Warning size={14} aria-hidden className="flex-none" />
      {um ? 'Aviso' : `${avisos.length} avisos`}
    </>
  );
  return (
    <Dica rotulo={um ? primeiro.valor : avisos.map((a) => a.valor).join(' · ')} lado="top">
      {um ? (
        <Link to="/avisos" search={{ id: primeiro.id }} aria-label={nome} className={classe}>
          {conteudo}
        </Link>
      ) : (
        <Link
          to="/avisos"
          search={{ entidade, entidadeId: primeiro.entidadeId }}
          aria-label={nome}
          className={classe}
        >
          {conteudo}
        </Link>
      )}
    </Dica>
  );
}
