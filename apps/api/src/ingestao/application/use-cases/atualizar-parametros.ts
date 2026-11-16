import type { Auditoria } from '../../../auditoria/auditoria';
import { ParametrosInvalidosError } from '../erros';
import type {
  ParametrosIngestao,
  ParametrosIngestaoRepository,
} from '../ports/parametros-ingestao.repository';

function validar(p: ParametrosIngestao) {
  if (!Number.isInteger(p.travaRemocaoMinimo) || p.travaRemocaoMinimo < 0) {
    throw new ParametrosInvalidosError('O mínimo da trava não pode ser negativo.');
  }
  if (!(p.travaRemocaoFator > 0)) {
    throw new ParametrosInvalidosError('O múltiplo da trava precisa ser maior que zero.');
  }
  const dias = p.retencaoLinhasBrutasDias;
  if (!Number.isInteger(dias) || dias < 1 || dias > 3650) {
    throw new ParametrosInvalidosError('A retenção precisa ficar entre 1 e 3650 dias.');
  }
}

/** Parâmetros da importação editados por tela (com auditoria dos campos que mudaram). */
export class AtualizarParametros {
  constructor(
    private readonly parametros: ParametrosIngestaoRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, novos: ParametrosIngestao) {
    validar(novos);
    const atuais = await this.parametros.obter();
    const mudou = (Object.keys(novos) as (keyof ParametrosIngestao)[]).filter(
      (campo) => atuais[campo] !== novos[campo],
    );
    if (!mudou.length) return;
    await this.parametros.salvar(novos);
    await this.auditoria.registrar({
      ator: { tipo: 'usuario', id: usuarioId },
      entidade: 'parametros_ingestao',
      entidadeId: '1',
      acao: 'alterado',
      antes: Object.fromEntries(mudou.map((c) => [c, atuais[c]])),
      depois: Object.fromEntries(mudou.map((c) => [c, novos[c]])),
      em: this.agora(),
    });
  }
}
