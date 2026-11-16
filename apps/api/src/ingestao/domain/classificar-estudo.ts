import { normalizarNome } from '../../catalogo/comum/nomes';
import { chaveEstudo, chaveEstudoLimpo } from './nome-estudo';
import { volumeDoLaudo } from './volume';

export interface ExameDoCadastro {
  id: string;
  modalidadeId: string | null;
  especialidadeId: string | null;
  categoriaId: string | null;
}

export interface ValorForaDoPadrao {
  valores: number;
  /** Exame vinculado: empresta especialidade e categoria ao estudo que não está no cadastro. */
  exame: ExameDoCadastro | null;
}

export interface PecaDaQuebra {
  exameId: string;
  categoriaExameId: string | null;
  /** Usada só quando o exame não tem categoria. */
  categoriaPecaId: string | null;
}

/**
 * Retrato do catálogo usado numa importação, montado uma vez. Só entram os itens ativos (e, nos
 * valores fora do padrão, só os maiores que zero). Chaves:
 * - `exames` e `valoresForaDoPadrao`: `chaveEstudo` (sem o sufixo " X1 X6" do fim);
 * - `quebras`: `chaveEstudoLimpo`;
 * - `modalidades` (códigos e variações), `especialidades` (nomes, grafias e regiões anatômicas)
 *   e `especialidadesInvalidas` ("não é especialidade"): `normalizarNome`.
 */
export interface RetratoCatalogo {
  exames: ReadonlyMap<string, ExameDoCadastro>;
  valoresForaDoPadrao: ReadonlyMap<string, ValorForaDoPadrao>;
  quebras: ReadonlyMap<string, readonly PecaDaQuebra[]>;
  modalidades: ReadonlyMap<string, string>;
  especialidades: ReadonlyMap<string, string>;
  especialidadesInvalidas: ReadonlySet<string>;
}

export interface EstudoDoLaudo {
  estudo: string;
  modalidade: string;
  especialidade: string;
  valores: number | null;
}

export type TipoPendencia = 'estudo' | 'modalidade' | 'especialidade';

export interface Pendencia {
  tipo: TipoPendencia;
  /** Como chegou na planilha. */
  valor: string;
}

export interface EstudoClassificado {
  exameId: string | null;
  modalidadeId: string | null;
  especialidadeId: string | null;
  categoriaId: string | null;
  volume: number;
  pecas: { exameId: string; categoriaId: string | null }[];
  pendencias: Pendencia[];
}

/**
 * Classifica o estudo de um laudo pelo catálogo, com as regras do dashboards-one:
 * - modalidade: a do exame do cadastro (é assim que a mamografia em CR/DX vira MG); sem ele, a
 *   variação de modalidade (OT/BMD → DO, CR/DX → RX);
 * - especialidade: a do exame do cadastro ou do exame vinculado ao valor fora do padrão; sem eles,
 *   a que chega, pela grafia ou região anatômica. Modalidade no campo especialidade (CT, RAIO X)
 *   e "não é especialidade" são ignoradas;
 * - categoria: a do exame (ou do vinculado);
 * - quebra: o estudo limpo vira uma peça por exame, cada uma valendo 1.
 */
export function classificarEstudo(l: EstudoDoLaudo, catalogo: RetratoCatalogo): EstudoClassificado {
  const pendencias: Pendencia[] = [];
  const chave = chaveEstudo(l.estudo);
  const exame = catalogo.exames.get(chave) ?? null;
  const foraDoPadrao = catalogo.valoresForaDoPadrao.get(chave);
  const referencia = exame ?? foraDoPadrao?.exame ?? null;
  const pecas = (catalogo.quebras.get(chaveEstudoLimpo(l.estudo)) ?? []).map((p) => ({
    exameId: p.exameId,
    categoriaId: p.categoriaExameId ?? p.categoriaPecaId,
  }));

  if (!referencia && pecas.length === 0) pendencias.push({ tipo: 'estudo', valor: l.estudo });

  let modalidadeId = exame?.modalidadeId ?? null;
  if (!modalidadeId) {
    modalidadeId = catalogo.modalidades.get(normalizarNome(l.modalidade)) ?? null;
    if (!modalidadeId) pendencias.push({ tipo: 'modalidade', valor: l.modalidade });
  }

  let especialidadeId = referencia?.especialidadeId ?? null;
  if (!especialidadeId) {
    const chaveEspecialidade = normalizarNome(l.especialidade);
    const ignorada =
      chaveEspecialidade === '' ||
      catalogo.modalidades.has(chaveEspecialidade) ||
      catalogo.especialidadesInvalidas.has(chaveEspecialidade);
    if (!ignorada) {
      especialidadeId = catalogo.especialidades.get(chaveEspecialidade) ?? null;
      if (!especialidadeId) pendencias.push({ tipo: 'especialidade', valor: l.especialidade });
    }
  }

  return {
    exameId: exame?.id ?? null,
    modalidadeId,
    especialidadeId,
    categoriaId: referencia?.categoriaId ?? null,
    volume: volumeDoLaudo(l.valores, foraDoPadrao?.valores),
    pecas,
    pendencias,
  };
}
