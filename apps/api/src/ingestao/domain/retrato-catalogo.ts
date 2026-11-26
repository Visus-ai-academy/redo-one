import { normalizarNome } from '../../catalogo/comum/nomes';
import type {
  ExameDoCadastro,
  PecaDaQuebra,
  RetratoCatalogo,
  ValorForaDoPadrao,
} from './classificar-estudo';
import { chaveEstudo, chaveEstudoLimpo } from './nome-estudo';

/**
 * As linhas do catálogo de que o retrato é feito. Exames: todos (os inativos só emprestam o
 * vínculo do valor fora do padrão), em ordem de nome. O resto: só os ativos; as peças, na ordem
 * em que as regras e as peças foram criadas.
 */
export interface LinhasCatalogo {
  exames: (ExameDoCadastro & { nome: string; ativo: boolean })[];
  foraDoPadrao: { estudoDescricao: string; valores: number; exameId: string | null }[];
  pecas: (PecaDaQuebra & { quebraId: string; estudo: string })[];
  modalidades: { id: string; codigo: string }[];
  variacoesModalidade: { origem: string; modalidadeId: string }[];
  especialidades: { id: string; nome: string }[];
  variacoesEspecialidade: { origem: string; especialidadeId: string | null; tipo: string }[];
}

/** Primeira ocorrência vence, como os resolvedores do dashboards-one. */
function indice<V>(pares: [string, V][]) {
  const mapa = new Map<string, V>();
  for (const [chave, valor] of pares) if (chave && !mapa.has(chave)) mapa.set(chave, valor);
  return mapa;
}

/** O retrato do catálogo que a importação usa para classificar o estudo de cada laudo. */
export function montarRetratoCatalogo(l: LinhasCatalogo): RetratoCatalogo {
  const exameDoCadastro = (e: LinhasCatalogo['exames'][number]): ExameDoCadastro => ({
    id: e.id,
    modalidadeId: e.modalidadeId,
    especialidadeId: e.especialidadeId,
    categoriaId: e.categoriaId,
  });
  // O vínculo do valor fora do padrão vale mesmo com o exame inativo, como no dashboards-one.
  const examePorId = new Map(l.exames.map((e) => [e.id, exameDoCadastro(e)]));

  // A regra também passa pela limpeza do estudo (decidido em 16/11/2026): no dashboards-one a
  // regra gravada com " X1 X6" nunca casava, porque só o estudo do laudo era limpo. Duas regras
  // com a mesma chave depois de limpas: vale a primeira.
  const quebras = new Map<string, PecaDaQuebra[]>();
  const donoDaChave = new Map<string, string>();
  for (const { quebraId, estudo, ...peca } of l.pecas) {
    const chave = chaveEstudoLimpo(estudo);
    if ((donoDaChave.get(chave) ?? quebraId) !== quebraId) continue;
    donoDaChave.set(chave, quebraId);
    quebras.set(chave, [...(quebras.get(chave) ?? []), peca]);
  }

  return {
    exames: indice(
      l.exames.filter((e) => e.ativo).map((e) => [chaveEstudo(e.nome), exameDoCadastro(e)]),
    ),
    valoresForaDoPadrao: indice<ValorForaDoPadrao>(
      l.foraDoPadrao
        .filter((f) => f.valores > 0)
        .map((f) => [
          chaveEstudo(f.estudoDescricao),
          { valores: f.valores, exame: f.exameId ? (examePorId.get(f.exameId) ?? null) : null },
        ]),
    ),
    quebras,
    modalidades: indice([
      ...l.modalidades.map((m): [string, string] => [normalizarNome(m.codigo), m.id]),
      ...l.variacoesModalidade.map((v): [string, string] => [
        normalizarNome(v.origem),
        v.modalidadeId,
      ]),
    ]),
    especialidades: indice([
      ...l.especialidades.map((e): [string, string] => [normalizarNome(e.nome), e.id]),
      ...l.variacoesEspecialidade.flatMap((v): [string, string][] =>
        v.especialidadeId ? [[normalizarNome(v.origem), v.especialidadeId]] : [],
      ),
    ]),
    especialidadesInvalidas: new Set(
      l.variacoesEspecialidade
        .filter((v) => v.tipo === 'invalida')
        .map((v) => normalizarNome(v.origem)),
    ),
  };
}
