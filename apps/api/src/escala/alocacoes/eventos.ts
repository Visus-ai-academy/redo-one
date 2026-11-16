import type { EventoAuditoria } from '../../auditoria/auditoria';
import type { ContextoEventoEscala, EntidadeEscala } from '../auditoria-escala';
import type { AjusteGravado, AlocacaoGravada } from './alocacoes.repository';

/** Quem mexe na escala: o recorte vale para quem não tem acesso total. */
export interface AtorEscala {
  usuarioId: string;
  acessoTotal: boolean;
}

/** Chaves que o Histórico da escala lê para filtrar por médico e aplicar o recorte. */
const contexto = (a: AlocacaoGravada): ContextoEventoEscala => ({
  medicoId: a.medicoId,
  turnoId: a.turnoId,
  frenteId: a.frenteId,
});

function fotoAlocacao({ id: _, ...campos }: AlocacaoGravada): Record<string, unknown> {
  return { ...campos };
}

function fotoAjuste(ajuste: AjusteGravado, alocacao: AlocacaoGravada): Record<string, unknown> {
  return {
    alocacaoId: ajuste.alocacaoId,
    data: ajuste.data,
    produtividade: ajuste.produtividade,
    observacoes: ajuste.observacoes,
    ...contexto(alocacao),
  };
}

/** Monta os eventos da escala de um ator num instante. */
export class EventosEscala {
  constructor(
    private readonly ator: AtorEscala,
    private readonly em: Date,
  ) {}

  alocacaoCriada(a: AlocacaoGravada): EventoAuditoria {
    return this.evento('alocacao', a.id, 'criado', undefined, fotoAlocacao(a));
  }

  /** Só os campos que mudaram (e o contexto no `depois`); `null` se nada mudou. */
  alocacaoAlterada(antes: AlocacaoGravada, depois: AlocacaoGravada): EventoAuditoria | null {
    const mudancas = diferenca(fotoAlocacao(antes), fotoAlocacao(depois));
    if (!mudancas) return null;
    return this.evento('alocacao', depois.id, 'alterado', mudancas.antes, {
      ...mudancas.depois,
      ...contexto(depois),
    });
  }

  /** A vigência terminou (ex.: a escala do médico mudou a partir de uma data). */
  alocacaoEncerrada(antes: AlocacaoGravada, depois: AlocacaoGravada): EventoAuditoria {
    return this.evento(
      'alocacao',
      depois.id,
      'encerrado',
      { dataFim: antes.dataFim },
      { dataFim: depois.dataFim, ...contexto(depois) },
    );
  }

  alocacaoRemovida(a: AlocacaoGravada): EventoAuditoria {
    return this.evento('alocacao', a.id, 'excluido', fotoAlocacao(a));
  }

  ajusteCriado(ajuste: AjusteGravado, alocacao: AlocacaoGravada): EventoAuditoria {
    return this.evento(
      'ajuste_produtividade',
      ajuste.id,
      'criado',
      undefined,
      fotoAjuste(ajuste, alocacao),
    );
  }

  ajusteAlterado(
    antes: AjusteGravado,
    depois: AjusteGravado,
    alocacao: AlocacaoGravada,
  ): EventoAuditoria | null {
    const mudancas = diferenca(fotoAjuste(antes, alocacao), fotoAjuste(depois, alocacao));
    if (!mudancas) return null;
    return this.evento('ajuste_produtividade', depois.id, 'alterado', mudancas.antes, {
      ...mudancas.depois,
      data: depois.data,
      ...contexto(alocacao),
    });
  }

  ajusteRemovido(ajuste: AjusteGravado, alocacao: AlocacaoGravada): EventoAuditoria {
    return this.evento('ajuste_produtividade', ajuste.id, 'excluido', fotoAjuste(ajuste, alocacao));
  }

  private evento(
    entidade: EntidadeEscala,
    entidadeId: string,
    acao: string,
    antes?: Record<string, unknown>,
    depois?: Record<string, unknown>,
  ): EventoAuditoria {
    return {
      ator: { tipo: 'usuario', id: this.ator.usuarioId },
      entidade,
      entidadeId,
      acao,
      ...(antes ? { antes } : {}),
      ...(depois ? { depois } : {}),
      em: this.em,
    };
  }
}

/** Só os campos de `depois` que mudaram em relação a `antes`; `null` se nada mudou. */
export function diferenca(antes: Record<string, unknown>, depois: Record<string, unknown>) {
  const mudou = Object.keys(depois).filter(
    (campo) => JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo]),
  );
  if (!mudou.length) return null;
  const recorte = (campos: Record<string, unknown>) =>
    Object.fromEntries(mudou.map((c) => [c, campos[c]]));
  return { antes: recorte(antes), depois: recorte(depois) };
}
