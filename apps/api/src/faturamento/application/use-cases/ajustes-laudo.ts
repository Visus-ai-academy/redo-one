import type { Auditoria } from '../../../auditoria/auditoria';
import { ErroDeDominio } from '../../../comum/erro-de-dominio';
import type {
  AjusteLaudo,
  AjustesLaudoRepository,
  TipoAjusteLaudo,
} from '../ports/ajustes-laudo.repository';

const ENTIDADE = 'ajuste_laudo_faturamento';

export class AjusteLaudoInvalidoError extends ErroDeDominio {
  readonly tipo = 'invalido';
}

export class AjusteLaudoNaoEncontradoError extends ErroDeDominio {
  readonly tipo = 'nao_encontrado';
  constructor(o = 'Ajuste') {
    super(`${o} não encontrado.`);
  }
}

const exigirMotivo = (motivo: string) => {
  const m = motivo.trim();
  if (!m) throw new AjusteLaudoInvalidoError('Informe o motivo do ajuste: ele fica no histórico.');
  return m;
};

export interface PedidoAjusteLaudo {
  laudoId: string;
  tipo: TipoAjusteLaudo;
  /** Só no tipo `valor`: o unitário cobrado por este laudo, em centavos. */
  valorUnitarioCentavos: number | null;
  motivo: string;
}

/**
 * Ajuste manual do faturamento de um laudo: valor forçado ou excluir, com motivo. Trocar encerra o
 * vigente (nada se apaga). Na competência aberta, a prévia se refaz; na fechada, o ajuste entra
 * pelo recálculo com motivo.
 */
export class CriarAjusteLaudo {
  constructor(
    private readonly repo: AjustesLaudoRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, p: PedidoAjusteLaudo): Promise<string> {
    const motivo = exigirMotivo(p.motivo);
    const valor = p.tipo === 'valor' ? p.valorUnitarioCentavos : null;
    if (p.tipo === 'valor' && (valor === null || !Number.isInteger(valor) || valor < 0))
      throw new AjusteLaudoInvalidoError('Informe o valor do laudo, em centavos, zero ou mais.');
    const laudo = await this.repo.obterLaudo(p.laudoId);
    if (!laudo) throw new AjusteLaudoNaoEncontradoError('Laudo');
    const anterior = await this.repo.vigente(laudo.identidade);
    const em = this.agora();
    const id = await this.repo.criar(
      { laudo, tipo: p.tipo, valorUnitarioCentavos: valor, motivo },
      { usuarioId, em },
      anterior ? `Trocado por outro ajuste: ${motivo}` : null,
    );
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'criado',
      antes: anterior
        ? {
            ajusteId: anterior.id,
            tipo: anterior.tipo,
            valorUnitarioCentavos: anterior.valorUnitarioCentavos,
          }
        : undefined,
      depois: {
        laudoId: laudo.id,
        competencia: laudo.competencia,
        tipo: p.tipo,
        valorUnitarioCentavos: valor,
        motivo,
      },
      em,
    });
    return id;
  }
}

/** Tira o ajuste (o laudo volta à tabela de preços), com motivo; ele fica no histórico. */
export class EncerrarAjusteLaudo {
  constructor(
    private readonly repo: AjustesLaudoRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, id: string, motivo: string): Promise<void> {
    const m = exigirMotivo(motivo);
    const em = this.agora();
    if (!(await this.repo.encerrar(id, m, { usuarioId, em })))
      throw new AjusteLaudoNaoEncontradoError();
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: ENTIDADE,
      entidadeId: id,
      acao: 'encerrado',
      depois: { motivo: m },
      em,
    });
  }
}

export class ListarAjustesLaudo {
  constructor(private readonly repo: AjustesLaudoRepository) {}

  executar(competencia: string): Promise<AjusteLaudo[]> {
    return this.repo.listar(competencia);
  }
}
