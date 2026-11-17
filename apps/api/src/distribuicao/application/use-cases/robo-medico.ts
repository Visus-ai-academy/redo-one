import type { Ator, Auditoria } from '../../../auditoria/auditoria';
import { MedicoNaoEncontradoError } from '../erros';
import type { CadastrosDistribuicao } from '../ports/cadastros-distribuicao';
import type {
  ParametrosMedico,
  ParametrosMedicoRepository,
} from '../ports/parametros-medico.repository';

/** Parâmetros do robô de um médico (hoje, só se ele está habilitado). */
export class ObterRoboMedico {
  constructor(
    private readonly parametros: ParametrosMedicoRepository,
    private readonly cadastros: CadastrosDistribuicao,
  ) {}

  async executar(medicoId: string): Promise<ParametrosMedico> {
    if (!(await this.cadastros.medicoExiste(medicoId))) throw new MedicoNaoEncontradoError();
    return this.parametros.obter(medicoId);
  }
}

export class DefinirRoboMedico {
  constructor(
    private readonly parametros: ParametrosMedicoRepository,
    private readonly cadastros: CadastrosDistribuicao,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(ator: Ator, medicoId: string, novos: ParametrosMedico): Promise<void> {
    if (!(await this.cadastros.medicoExiste(medicoId))) throw new MedicoNaoEncontradoError();
    const atuais = await this.parametros.obter(medicoId);
    if (atuais.habilitadoRobo === novos.habilitadoRobo) return;
    await this.parametros.salvar(medicoId, novos);
    await this.auditoria.registrar({
      ator,
      entidade: 'medico_distribuicao',
      entidadeId: medicoId,
      acao: 'alterado',
      antes: { habilitadoRobo: atuais.habilitadoRobo },
      depois: { habilitadoRobo: novos.habilitadoRobo },
      em: this.agora(),
    });
  }
}
