import type { Auditoria } from '../../../auditoria/auditoria';
import type { TipoAviso } from '../../domain/preparar-laudo';
import { ConfiguracaoTipoInvalidaError, TipoAvisoNaoEncontradoError } from '../erros';
import type { TiposAvisoRepository } from '../ports/tipos-aviso.repository';

/** Configurações › Avisos: cada tipo com os responsáveis, a trava e os pendentes agora. */
export class ListarTiposAviso {
  constructor(private readonly tipos: TiposAvisoRepository) {}

  async executar() {
    const [tipos, papeis] = await Promise.all([this.tipos.listar(), this.tipos.papeis()]);
    return { tipos, papeis };
  }
}

/** Responsáveis e "impede fechar a competência" de um tipo, com auditoria. */
export class ConfigurarTipoAviso {
  constructor(
    private readonly tipos: TiposAvisoRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(
    usuarioId: string,
    tipo: TipoAviso,
    dados: { impedeFecharCompetencia: boolean; papeisIds: readonly string[] },
  ) {
    const atual = await this.tipos.obter(tipo);
    if (!atual) throw new TipoAvisoNaoEncontradoError();
    const papeisIds = [...new Set(dados.papeisIds)];
    if ((await this.tipos.papeisInexistentes(papeisIds)).length) {
      throw new ConfiguracaoTipoInvalidaError('Um dos papéis escolhidos não existe mais.');
    }
    const antesIds = atual.responsaveis.map((r) => r.id).sort();
    const mesmo =
      atual.impedeFecharCompetencia === dados.impedeFecharCompetencia &&
      antesIds.join() === [...papeisIds].sort().join();
    if (mesmo) return;

    const em = this.agora();
    await this.tipos.salvar(tipo, {
      impedeFecharCompetencia: dados.impedeFecharCompetencia,
      papeisIds,
      em,
    });
    const nomes = new Map((await this.tipos.papeis()).map((p) => [p.id, p.nome]));
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: 'tipo_aviso',
      entidadeId: tipo,
      acao: 'configurado',
      antes: {
        impedeFecharCompetencia: atual.impedeFecharCompetencia,
        responsaveis: atual.responsaveis.map((r) => r.nome).sort(),
      },
      depois: {
        impedeFecharCompetencia: dados.impedeFecharCompetencia,
        responsaveis: papeisIds.map((id) => nomes.get(id) ?? id).sort(),
      },
      em,
    });
  }
}
