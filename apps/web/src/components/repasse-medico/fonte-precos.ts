import { precosRepasseControllerAlterar } from '../../gen/clients/precosRepasseControllerAlterar';
import { precosRepasseControllerEncerrar } from '../../gen/clients/precosRepasseControllerEncerrar';
import { precosRepasseControllerExportar } from '../../gen/clients/precosRepasseControllerExportar';
import { precosRepasseControllerHistorico } from '../../gen/clients/precosRepasseControllerHistorico';
import { precosRepasseControllerImportar } from '../../gen/clients/precosRepasseControllerImportar';
import { precosRepasseControllerIncluir } from '../../gen/clients/precosRepasseControllerIncluir';
import { precosRepasseControllerListar } from '../../gen/clients/precosRepasseControllerListar';
import { precosRepasseControllerOpcoes } from '../../gen/clients/precosRepasseControllerOpcoes';
import { precosRepasseControllerHistoricoQueryKey } from '../../gen/hooks/usePrecosRepasseControllerHistorico';
import { precosRepasseControllerOpcoesQueryKey } from '../../gen/hooks/usePrecosRepasseControllerOpcoes';
import type { MudarPrecoRepasseDto } from '../../gen/types/MudarPrecoRepasseDto';
import { reaisDosCentavos, TODOS_OS_CLIENTES } from '../faturamento/precos';
import type { FontePrecos, ValoresPrecoTela } from '../faturamento/tabela-precos';

/** Arranjo que o atalho abre já escolhido (`?arranjo=mod.esp.cat.pri`, os ids do catálogo). */
export type ArranjoDoAtalho = {
  modalidadeId: string;
  especialidadeId: string;
  categoriaId: string;
  prioridadeId: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "mod.esp.cat.pri" (ids) → o arranjo; qualquer outra coisa, nada. */
export function arranjoDoAtalho(texto: string | undefined): ArranjoDoAtalho | undefined {
  const partes = (texto ?? '').split('.');
  if (partes.length !== 4 || !partes.every((p) => UUID.test(p))) return undefined;
  const [modalidadeId, especialidadeId, categoriaId, prioridadeId] = partes as [
    string,
    string,
    string,
    string,
  ];
  return { modalidadeId, especialidadeId, categoriaId, prioridadeId };
}

/** O arranjo no formato do atalho. */
export const textoDoArranjo = (a: ArranjoDoAtalho) =>
  [a.modalidadeId, a.especialidadeId, a.categoriaId, a.prioridadeId].join('.');

export function corpoDoPrecoRepasse(v: ValoresPrecoTela): MudarPrecoRepasseDto {
  const todos = v.clienteId === TODOS_OS_CLIENTES;
  return {
    modalidadeId: v.modalidadeId,
    especialidadeId: v.especialidadeId,
    categoriaId: v.categoriaId,
    prioridadeId: v.prioridadeId,
    todosClientes: todos,
    clienteId: todos ? null : v.clienteId,
    valor: reaisDosCentavos(v.valor),
    aPartirDe: v.aPartirDe,
  };
}

const textoData = (d: string | Date | null) => (d === null ? null : String(d));

/** Os preços de repasse do médico (arranjo × cliente) para a `TabelaPrecosDaFonte`. */
export function fonteRepasse(medicoId: string): FontePrecos {
  const path = { medicoId };
  return {
    chave: [{ url: '/repasse/medicos/:medicoId/precos', params: path }],
    dimensao: 'cliente',
    entidadeAviso: 'preco_repasse',
    listar: (query) => ({
      queryKey: [{ url: '/repasse/medicos/:medicoId/precos', params: path }, query],
      queryFn: ({ signal }) => precosRepasseControllerListar({ path, query, signal }).unwrap(),
    }),
    opcoes: () => ({
      queryKey: precosRepasseControllerOpcoesQueryKey(),
      queryFn: ({ signal }) => precosRepasseControllerOpcoes({ signal }).unwrap(),
    }),
    historico: (item) => {
      const query = {
        modalidadeId: item.modalidadeId,
        especialidadeId: item.especialidadeId,
        categoriaId: item.categoriaId,
        prioridadeId: item.prioridadeId,
        todosClientes: Boolean(item.todosClientes),
        ...(item.todosClientes || !item.clienteId ? {} : { clienteId: item.clienteId }),
      };
      return {
        queryKey: precosRepasseControllerHistoricoQueryKey({ path, query }),
        queryFn: async ({ signal }) =>
          (await precosRepasseControllerHistorico({ path, query, signal }).unwrap()).map((v) => ({
            ...v,
            criadoEm: textoData(v.criadoEm),
            encerradoEm: textoData(v.encerradoEm),
          })),
      };
    },
    incluir: (v) => precosRepasseControllerIncluir({ path, body: corpoDoPrecoRepasse(v) }).unwrap(),
    alterar: (precoId, v) =>
      precosRepasseControllerAlterar({
        path: { ...path, precoId },
        body: corpoDoPrecoRepasse(v),
      }).unwrap(),
    encerrar: (precoId, aPartirDe) =>
      precosRepasseControllerEncerrar({ path: { ...path, precoId }, body: { aPartirDe } }).unwrap(),
    exportar: () => precosRepasseControllerExportar({ path }).unwrap(),
    importar: (conteudo, aPartirDe) =>
      precosRepasseControllerImportar({ path, body: { conteudo, aPartirDe } }).unwrap(),
    vazio: (comBusca) =>
      comBusca
        ? 'Nenhum preço com essa busca.'
        : 'Nenhum preço de repasse. Os laudos deste médico ficam sem preço (pagos a zero, com aviso) até o preço existir.',
    ajudaPlanilha:
      'No modelo da exportação: Modalidade, Especialidade, Categoria, Prioridade, Cliente ("Todos os clientes" ou o nome na MobileMed), Valor e Vale a partir de. A linha exportada traz o início do preço (MM/AAAA ou "desde sempre") e muda só ele; a linha com a coluna vazia é preço novo ou alterado a partir da competência abaixo. Se a tabela mudou depois da exportação, a linha é recusada: exporte de novo.',
  };
}
