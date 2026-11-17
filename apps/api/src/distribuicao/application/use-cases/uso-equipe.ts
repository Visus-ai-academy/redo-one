import type { Ator, Auditoria } from '../../../auditoria/auditoria';
import { EquipeNaoEncontradaError } from '../erros';
import type { CadastrosDistribuicao } from '../ports/cadastros-distribuicao';
import type {
  ParametrosEquipe,
  ParametrosEquipeRepository,
} from '../ports/parametros-equipe.repository';

async function lerOuFalhar(
  parametros: ParametrosEquipeRepository,
  cadastros: CadastrosDistribuicao,
  equipeId: string,
): Promise<ParametrosEquipe> {
  const atuais = (await cadastros.equipeExiste(equipeId)) ? await parametros.obter(equipeId) : null;
  if (!atuais) throw new EquipeNaoEncontradaError();
  return atuais;
}

/** Como o robô usa a equipe: direciona aos membros ou só tira do robô (plantão). */
export class ObterUsoEquipe {
  constructor(
    private readonly parametros: ParametrosEquipeRepository,
    private readonly cadastros: CadastrosDistribuicao,
  ) {}

  executar(equipeId: string): Promise<ParametrosEquipe> {
    return lerOuFalhar(this.parametros, this.cadastros, equipeId);
  }
}

/** Troca o uso da equipe, com auditoria na própria equipe (campo `plantao`). */
export class DefinirUsoEquipe {
  constructor(
    private readonly parametros: ParametrosEquipeRepository,
    private readonly cadastros: CadastrosDistribuicao,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, equipeId: string, novos: ParametrosEquipe): Promise<void> {
    const atuais = await lerOuFalhar(this.parametros, this.cadastros, equipeId);
    if (atuais.plantao === novos.plantao) return;
    await this.parametros.salvar(equipeId, { plantao: novos.plantao });
    await this.auditoria.registrar({
      ator,
      entidade: 'equipe',
      entidadeId: equipeId,
      acao: 'alterado',
      antes: { plantao: atuais.plantao },
      depois: { plantao: novos.plantao },
      em: this.agora(),
    });
  }
}
