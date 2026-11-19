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
  const entre = (v: number, min: number, max: number) =>
    Number.isInteger(v) && v >= min && v <= max;
  const intervalo = p.mobilemedIntervaloMinutos;
  if (intervalo !== null && !entre(intervalo, 5, 1440)) {
    throw new ParametrosInvalidosError('O intervalo precisa ficar entre 5 e 1440 minutos.');
  }
  if (!entre(p.mobilemedMesesAnteriores, 0, 12)) {
    throw new ParametrosInvalidosError('Os meses anteriores precisam ficar entre 0 e 12.');
  }
  if (!entre(p.mobilemedJanelaDias, 1, 31)) {
    throw new ParametrosInvalidosError('A janela precisa ficar entre 1 e 31 dias.');
  }
  if (!entre(p.mobilemedTeto, 1, 1_000_000)) {
    throw new ParametrosInvalidosError('O teto precisa ser um inteiro a partir de 1.');
  }
  if (p.mobilemedCompartilhamentoUnidades.some((u) => !u)) {
    throw new ParametrosInvalidosError('Informe o nome de cada unidade.');
  }
}

const normalizar = (p: ParametrosIngestao): ParametrosIngestao => ({
  ...p,
  mobilemedCompartilhamentoUnidades: [
    ...new Set(p.mobilemedCompartilhamentoUnidades.map((u) => u.trim())),
  ],
});

/** Parâmetros da importação editados por tela (com auditoria dos campos que mudaram). */
export class AtualizarParametros {
  constructor(
    private readonly parametros: ParametrosIngestaoRepository,
    private readonly auditoria: Auditoria,
    private readonly agora: () => Date,
  ) {}

  async executar(usuarioId: string, pedido: ParametrosIngestao) {
    const novos = normalizar(pedido);
    validar(novos);
    const atuais = await this.parametros.obter();
    const mudou = (Object.keys(novos) as (keyof ParametrosIngestao)[]).filter(
      (campo) => JSON.stringify(atuais[campo]) !== JSON.stringify(novos[campo]),
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
