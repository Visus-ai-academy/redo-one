import { normalizarNome } from '../comum/nomes';
import type { Rotulo } from '../comum/rotulo';
import { DeParaInvalidoError } from './de-para.errors';
import type {
  DadosDeParaEspecialidade,
  DadosDeParaModalidade,
  DadosDeParaPrioridade,
  DadosDeParaValor,
  DadosSufixo,
} from './de-para.repository';

/** O que muda entre os de-paras: o rótulo, como limpar e validar, e a chave única. */
export interface RegraDePara<D> {
  rotulo: Rotulo;
  /** Limpa e valida os dados; lança erro de domínio se algo não serve. */
  normalizar(dados: D): Promise<D>;
  /** Igual em dois de-paras = conflito (espelha a chave única da tabela). */
  chave(dados: D): string;
  /** Como a origem aparece na mensagem de conflito. */
  origem(dados: D): string;
}

const semAcento = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '');

export const REGRA_PRIORIDADE: RegraDePara<DadosDeParaPrioridade> = {
  rotulo: { entidade: 'de_para_prioridade', singular: 'De-para de prioridade', genero: 'm' },
  normalizar: async (d) => ({ ...d, origem: d.origem.trim() }),
  chave: (d) => d.origem,
  origem: (d) => d.origem,
};

/** O código da modalidade chega em maiúsculas (`OT`, `CR`); guardar assim deixa a chave valer. */
export const REGRA_MODALIDADE: RegraDePara<DadosDeParaModalidade> = {
  rotulo: { entidade: 'de_para_modalidade', singular: 'Variação de modalidade', genero: 'f' },
  normalizar: async (d) => ({ ...d, origem: d.origem.trim().toUpperCase() }),
  chave: (d) => d.origem,
  origem: (d) => d.origem,
};

/**
 * A importação compara a especialidade em maiúsculas; a região anatômica, também sem acento
 * (como no legado). Guardar já assim deixa a chave única valer para grafias equivalentes.
 */
export function REGRA_ESPECIALIDADE(especialidades: {
  buscar(id: string): Promise<{ nome: string } | null>;
}): RegraDePara<DadosDeParaEspecialidade> {
  return {
    rotulo: {
      entidade: 'de_para_especialidade',
      singular: 'De-para de especialidade',
      genero: 'm',
    },
    async normalizar(d) {
      const maiusculas = d.origem.trim().replace(/\s+/g, ' ').toUpperCase();
      const origem = d.tipo === 'regiao_anatomica' ? semAcento(maiusculas) : maiusculas;
      const base = { ...d, origem, observacoes: d.observacoes?.trim() || null };
      // Inválida é só uma lista: o destino sai do cadastro do exame, não daqui.
      if (d.tipo === 'invalida') return { ...base, especialidadeId: null };

      if (!d.especialidadeId) throw new DeParaInvalidoError('Informe a especialidade de destino.');
      const destino = await especialidades.buscar(d.especialidadeId);
      if (!destino) throw new DeParaInvalidoError('Especialidade não encontrada.');
      if (semAcento(destino.nome.toUpperCase()) === semAcento(origem)) {
        throw new DeParaInvalidoError('Origem e destino iguais: a regra não faria nada.');
      }
      return base;
    },
    chave: (d) => `${d.tipo}:${d.origem}`,
    origem: (d) => d.origem,
  };
}

export const REGRA_VALOR_EXAME: RegraDePara<DadosDeParaValor> = {
  rotulo: { entidade: 'de_para_valor_exame', singular: 'De-para de valores', genero: 'm' },
  normalizar: async (d) => {
    const estudoDescricao = d.estudoDescricao.trim();
    if (!normalizarNome(estudoDescricao)) {
      throw new DeParaInvalidoError('Informe a descrição do estudo como vem da MobileMed.');
    }
    return { ...d, estudoDescricao, exameId: d.exameId || null };
  },
  chave: (d) => normalizarNome(d.estudoDescricao),
  origem: (d) => d.estudoDescricao,
};

export const REGRA_SUFIXO: RegraDePara<DadosSufixo> = {
  rotulo: { entidade: 'sufixo_nome_cliente', singular: 'Sufixo', genero: 'm' },
  normalizar: async (d) => ({
    ...d,
    sufixo: d.sufixo.trim(),
    observacoes: d.observacoes?.trim() || null,
  }),
  chave: (d) => d.sufixo.toUpperCase(),
  origem: (d) => d.sufixo,
};
