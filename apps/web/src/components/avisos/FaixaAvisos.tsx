import { Warning } from '@phosphor-icons/react';
import { Link } from '@tanstack/react-router';

import type { ResumoAvisosDto } from '../../gen/types/ResumoAvisosDto';
import { textoDaFaixa } from '../../lib/avisos';

/**
 * Faixa no topo de todas as telas para quem é responsável por algum tipo de aviso com pendente
 * (Configurações › Avisos): quantos e há quanto tempo o mais antigo, com o link para a lista dos
 * seus. Não tem "fechar": some quando os avisos são resolvidos ou ignorados.
 */
export function FaixaAvisos({
  resumo,
  agora,
}: {
  resumo: ResumoAvisosDto | undefined;
  /** Referência do "há N dias" (testes). */
  agora?: Date;
}) {
  if (!resumo || resumo.total === 0) return null;
  return (
    <section
      aria-label="Avisos seus pendentes"
      className="bg-warning-soft text-warning flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm md:px-8"
    >
      <Warning size={18} aria-hidden className="flex-none" />
      <span className="font-medium">{textoDaFaixa(resumo, agora)}</span>
      <Link
        to="/avisos"
        search={{ meus: 1 }}
        className="focus-visible:outline-ring font-medium underline underline-offset-2 focus-visible:outline-2"
      >
        Ver os meus avisos
      </Link>
    </section>
  );
}
