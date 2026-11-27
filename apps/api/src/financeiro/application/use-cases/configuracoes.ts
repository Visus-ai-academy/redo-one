import type { Auditoria } from '../../../auditoria/auditoria';
import { RegistroAuditoria } from '../../../catalogo/comum/registro-auditoria';
import type { Clock } from '../../../identidade/clock';
import {
  CONFIGURACAO_PADRAO,
  type ConfiguracaoFinanceira,
  FAIXAS_PADRAO,
  faixaDoAtraso,
  prepararConfiguracao,
  rotuloDaFaixa,
} from '../../domain/configuracao-financeira';
import { hojeEmBrasilia } from '../../domain/dias';
import { exigirSemErros } from '../../domain/erros';
import type {
  ConfiguracoesFinanceiras,
  FiltroInadimplencia,
  Inadimplencia,
} from '../ports/configuracoes-financeiras';
import type { EmpresasFinanceiro } from '../ports/empresas';
import type { Ator } from './categorias';

const ROTULO = {
  entidade: 'configuracao_financeira',
  singular: 'Regras financeiras',
  genero: 'f',
} as const;

/** As regras de cada empresa do financeiro, com o padrão quando ela não gravou as suas. */
export class ConsultarConfiguracoes {
  constructor(
    private readonly empresas: Pick<EmpresasFinanceiro, 'listar'>,
    private readonly configs: Pick<ConfiguracoesFinanceiras, 'buscar'>,
  ) {}

  async listar() {
    const resultado = [];
    // Em série: poucas empresas, e o pool de produção é pequeno.
    for (const empresa of await this.empresas.listar()) {
      const gravada = await this.configs.buscar(empresa.id);
      resultado.push({
        empresaId: empresa.id,
        empresaNome: empresa.nome,
        ...(gravada ?? CONFIGURACAO_PADRAO),
        padrao: !gravada,
      });
    }
    return resultado;
  }
}

/** Grava as regras de uma empresa do financeiro. Auditado. */
export class SalvarConfiguracao {
  private readonly registro: RegistroAuditoria;

  constructor(
    private readonly empresas: Pick<EmpresasFinanceiro, 'usaFinanceiro'>,
    private readonly configs: ConfiguracoesFinanceiras,
    auditoria: Auditoria,
    clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO, auditoria, clock);
  }

  async executar(ator: Ator, empresaId: string, entrada: ConfiguracaoFinanceira) {
    if (!(await this.empresas.usaFinanceiro(empresaId))) {
      exigirSemErros({ empresaId: 'Escolha uma empresa que usa o financeiro do One.' });
    }
    const dados = prepararConfiguracao(entrada);
    const antes = (await this.configs.buscar(empresaId)) ?? CONFIGURACAO_PADRAO;
    await this.configs.salvar(empresaId, dados, ator.usuarioId);
    await this.registro.alterado(ator, empresaId, antes, dados);
  }
}

/** A aba Inadimplência: clientes com títulos vencidos, na faixa de atraso da empresa de cada um. */
export class ConsultarInadimplencia {
  constructor(
    private readonly fonte: Inadimplencia,
    private readonly empresas: Pick<EmpresasFinanceiro, 'listar'>,
    private readonly configs: Pick<ConfiguracoesFinanceiras, 'buscar'>,
    private readonly clock: Clock,
  ) {}

  async listar(filtro: Omit<FiltroInadimplencia, 'hoje' | 'faixasPadrao'>) {
    const pagina = await this.fonte.listar({
      ...filtro,
      hoje: hojeEmBrasilia(this.clock.now()),
      faixasPadrao: FAIXAS_PADRAO,
    });
    return {
      ...pagina,
      itens: pagina.itens.map(({ faixas, ...linha }) => {
        const indice = faixaDoAtraso(faixas, linha.diasDeAtraso);
        return {
          ...linha,
          faixa: {
            inicio: faixas[indice] as number,
            rotulo: rotuloDaFaixa(faixas, indice),
            indice,
            de: faixas.length,
          },
        };
      }),
      faixas: await this.opcoesDeFaixa(filtro.empresa),
    };
  }

  /** As faixas para o filtro: as das empresas em vista, sem repetir o começo. */
  private async opcoesDeFaixa(empresa: FiltroInadimplencia['empresa']) {
    const ids =
      empresa === 'todas' ? (await this.empresas.listar()).map((e) => e.id) : [empresa.id];
    const porInicio = new Map<number, string>();
    for (const id of ids) {
      const faixas = (await this.configs.buscar(id))?.faixasInadimplencia ?? FAIXAS_PADRAO;
      faixas.forEach((inicio, i) => {
        if (!porInicio.has(inicio)) porInicio.set(inicio, rotuloDaFaixa(faixas, i));
      });
    }
    return [...porInicio.entries()]
      .sort(([a], [b]) => a - b)
      .map(([inicio, rotulo]) => ({ inicio, rotulo }));
  }
}
