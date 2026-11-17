import type { TipoFrenteEscalaKey } from '../../gen/types/TipoFrenteEscala';

const GRUPOS: Record<TipoFrenteEscalaKey, string> = {
  especialidade: 'Especialidades',
  modalidade: 'Modalidades',
};
const ORDEM: (TipoFrenteEscalaKey | undefined)[] = ['especialidade', 'modalidade', undefined];

/** O que o select precisa de uma frente. */
export type FrenteParaOpcao = {
  id: string;
  rotulo: string;
  cor: string | null;
  tipo?: TipoFrenteEscalaKey;
};

export type OpcaoFrente = { valor: string; rotulo: string; cor: string | null; grupo?: string };

/**
 * Opções de um select de frente: especialidades, depois modalidades (cada uma sob o subtítulo e na
 * ordem recebida), com a cor. Sem tipo conhecido (ex.: frente inativa que só vem do plantão), vai
 * para o fim, sem subtítulo.
 */
export function opcoesDeFrentes(frentes: readonly FrenteParaOpcao[]): OpcaoFrente[] {
  return ORDEM.flatMap((tipo) =>
    frentes
      .filter((f) => f.tipo === tipo)
      .map((f) => ({
        valor: f.id,
        rotulo: f.rotulo,
        cor: f.cor,
        ...(tipo && { grupo: GRUPOS[tipo] }),
      })),
  );
}
