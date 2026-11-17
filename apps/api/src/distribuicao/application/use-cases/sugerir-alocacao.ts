import { type SugestaoAlocacao, sugestaoAlocacao } from '../../domain/arranjo';
import { FrenteNaoEncontradaError, MedicoNaoEncontradoError } from '../erros';
import type { ArranjosRepository } from '../ports/arranjos.repository';
import type { CadastrosDistribuicao } from '../ports/cadastros-distribuicao';

/** Pré-preenchimento da alocação da escala pelos arranjos do médico na frente escolhida. */
export class SugerirAlocacao {
  constructor(
    private readonly arranjos: ArranjosRepository,
    private readonly cadastros: CadastrosDistribuicao,
  ) {}

  async executar(medicoId: string, frenteId: string): Promise<SugestaoAlocacao | null> {
    if (!(await this.cadastros.medicoExiste(medicoId))) throw new MedicoNaoEncontradoError();
    const frente = await this.cadastros.frente(frenteId);
    if (!frente) throw new FrenteNaoEncontradaError();
    return sugestaoAlocacao(await this.arranjos.listar({ tipo: 'medico', id: medicoId }), frente);
  }
}
