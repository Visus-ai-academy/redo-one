import type { Ator, Auditoria } from '../../../auditoria/auditoria';
import { MedicoNaoEncontradoError } from '../erros';
import type { CadastrosDistribuicao } from '../ports/cadastros-distribuicao';
import type {
  ParametrosMedico,
  ParametrosMedicoRepository,
} from '../ports/parametros-medico.repository';

/** Parâmetros do robô de um médico: se está habilitado e em que o teto dele é contado. */
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

  /** Só os campos informados mudam; a auditoria guarda só o que mudou. */
  async executar(ator: Ator, medicoId: string, mudancas: Partial<ParametrosMedico>): Promise<void> {
    if (!(await this.cadastros.medicoExiste(medicoId))) throw new MedicoNaoEncontradoError();
    const atuais = await this.parametros.obter(medicoId);
    const antes: Partial<Record<keyof ParametrosMedico, unknown>> = {};
    const depois: Partial<Record<keyof ParametrosMedico, unknown>> = {};
    for (const campo of Object.keys(mudancas) as (keyof ParametrosMedico)[]) {
      const novo = mudancas[campo];
      if (novo === undefined || novo === atuais[campo]) continue;
      antes[campo] = atuais[campo];
      depois[campo] = novo;
    }
    if (!Object.keys(depois).length) return;
    await this.parametros.salvar(medicoId, { ...atuais, ...depois } as ParametrosMedico);
    await this.auditoria.registrar({
      ator,
      entidade: 'medico_distribuicao',
      entidadeId: medicoId,
      acao: 'alterado',
      antes,
      depois,
      em: this.agora(),
    });
  }
}
