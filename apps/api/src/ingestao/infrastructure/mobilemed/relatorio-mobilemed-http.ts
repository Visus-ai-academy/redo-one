import { type ClienteMobileMed, ErroMobileMed } from '../../../comum/mobilemed/cliente-mobilemed';
import type { FormatoPlanilha, PlanilhaLida } from '../../application/ports/leitor-planilha';
import {
  type FatiamentoRelatorio,
  type RelatorioMobileMed,
  RelatorioMobileMedError,
} from '../../application/ports/relatorio-mobilemed';
import { instantesDoPeriodo, type PeriodoDias } from '../../domain/periodo-mobilemed';
import { buscarFatiado } from './buscar-fatiado';
import { type ItemRelatorio, itemParaRegistro, respostaRelatorio } from './esquemas-relatorio';

const DIA_MS = 24 * 60 * 60 * 1000;

/** Filtro da tela "Descritivo Especialidades" (`laudos.mobilemed.com.br/relatorio/exames`). */
const filtroDescritivo = (de: Date, ate: Date) => ({
  data_realizacao: { data_inicial: '', data_final: '' },
  // Fim inclusivo, como a tela manda (23:59:59.xxx do último dia).
  data_laudo: {
    data_inicial: de.toISOString(),
    data_final: new Date(ate.getTime() - 1).toISOString(),
  },
  data_criacao: { data_inicial: '', data_final: '' },
  tipoAssinatura: null,
  residente_id: 0,
  empresa_id: [],
  gruposEmpresas_id: 0,
  is_concluido: null,
  prioridade_id: [],
  modalidades: [],
  isEspecialidades: true,
  isDescritivo: false,
  exibirNaoTratados: false as boolean | string,
  isResidentes: false,
  isDigitadores: false,
  isJustificado: false,
  tipoAcao: false as boolean | { id: null; descricao: string },
  status_empresa: null,
  is_complementar: null,
  usuario_id: 0,
  perfis: [1, 2, 9],
});

interface Consulta {
  caminho: string;
  filtro: (de: Date, ate: Date) => object;
}

/** Os dois recortes da mesma tela entram juntos: só o "fora do padrão" traz o estudo renomeado. */
const CONSULTAS: Record<FormatoPlanilha, Consulta[]> = {
  laudos: [
    { caminho: '/exame/relatorio/descritivoEspecialidade', filtro: filtroDescritivo },
    {
      caminho: '/exame/relatorio/descritivoEspecialidade',
      filtro: (de, ate) => ({ ...filtroDescritivo(de, ate), exibirNaoTratados: '1' }),
    },
  ],
  compartilhamento: [
    {
      caminho: '/exame/relatorio/examesCompartilhados',
      filtro: (de, ate) => ({
        ...filtroDescritivo(de, ate),
        tipoAssinatura: 1,
        isEspecialidades: false,
        tipoAcao: { id: null, descricao: 'TODOS' },
        compartilhamento: 'todos',
        isRelatorioExamesCompartilhados: true,
      }),
    },
  ],
};

/**
 * O relatório de laudos pela API do portal (`reports-api`), o mesmo que a tela exporta em XLSX.
 * Fatia o período (a resposta não pagina e corta no teto), valida cada item (fora do formato, a
 * importação inteira para) e entrega as linhas com as colunas da planilha, já sem o que a ingestão
 * não usa (CPF, identidade, convênio...).
 */
export class RelatorioMobileMedHttp implements RelatorioMobileMed {
  constructor(private readonly cliente: ClienteMobileMed) {}

  async buscar(
    formato: FormatoPlanilha,
    periodo: PeriodoDias,
    fatiamento: FatiamentoRelatorio,
  ): Promise<PlanilhaLida> {
    const { de, ate } = instantesDoPeriodo(periodo);
    const itens: ItemRelatorio[] = [];
    try {
      for (const { caminho, filtro } of CONSULTAS[formato]) {
        itens.push(
          ...(await buscarFatiado(
            de,
            ate,
            fatiamento.janelaDias * DIA_MS,
            fatiamento.teto,
            async (a, b) =>
              (
                await this.cliente.chamar('POST', caminho, respostaRelatorio, {
                  filtro: filtro(a, b),
                  paginacao: { pagina: 1, total_registros: 50 },
                })
              ).lista,
          )),
        );
      }
    } catch (erro) {
      // As mensagens do cliente nunca trazem dado de paciente (só rota, status e campos).
      if (erro instanceof ErroMobileMed) throw new RelatorioMobileMedError(erro.message);
      throw erro;
    }
    return {
      formato,
      linhas: itens.map((item, i) => ({
        numero: i + 1,
        registro: itemParaRegistro(item, formato),
      })),
    };
  }
}
