import { useQuery } from '@tanstack/react-query';

import type { TomEtiqueta } from '../components/etiqueta/Etiqueta';
import { avisosControllerListarQueryOptions } from '../gen/hooks/useAvisosControllerListar';
import type { StatusAvisoKey } from '../gen/types/StatusAviso';
import type { TipoAvisoKey } from '../gen/types/TipoAviso';

const TIPOS: Record<TipoAvisoKey, string> = {
  cliente: 'Cliente',
  medico: 'Médico',
  estudo: 'Estudo',
  modalidade: 'Modalidade',
  especialidade: 'Especialidade',
  prioridade: 'Prioridade',
  prioridade_operacao: 'Prioridade da operação',
};

export const tipoDoAviso = (tipo: TipoAvisoKey) => TIPOS[tipo];

const SITUACOES: Record<StatusAvisoKey, { texto: string; tom: TomEtiqueta }> = {
  pendente: { texto: 'Pendente', tom: 'atencao' },
  ignorado: { texto: 'Ignorado', tom: 'inativo' },
  resolvido: { texto: 'Resolvido', tom: 'sucesso' },
};

export const situacaoDoAviso = (status: StatusAvisoKey) => SITUACOES[status];

/**
 * Onde conferir o cadastro do aviso: muitas vezes basta um apelido num cadastro que já existe.
 * A busca vai limpa (sem "Dr." nem o id da conta MobileMed no médico, sem o " X2" do fim no
 * estudo). Quem vê o aviso vê a tela de destino: a API só mostra o tipo de aviso a quem tem o
 * `ver` dela.
 */
export function ondeProcurar({ tipo, valor }: { tipo: TipoAvisoKey; valor: string }) {
  switch (tipo) {
    case 'cliente':
      return {
        rotulo: 'Procurar em Clientes',
        to: '/clientes' as const,
        search: { busca: valor },
      };
    case 'medico':
      return {
        rotulo: 'Procurar em Médicos',
        to: '/medicos' as const,
        // Sem o "(ID MobileMed … sem cadastro)" que a importação pela API acrescenta.
        search: {
          busca: valor
            .replace(/\s*\(ID MobileMed \d+ sem cadastro\)\s*$/, '')
            .replace(/^dra?\.?\s+/i, ''),
        },
      };
    case 'estudo':
      return {
        rotulo: 'Procurar em Exames',
        to: '/exames' as const,
        search: { busca: valor.replace(/(?:\s+X\d+)+\s*$/i, '') },
      };
    case 'prioridade_operacao':
      // A grafia entra no de-para de uma das prioridades da operação (a tela tem poucas).
      return {
        rotulo: 'Abrir as prioridades da operação',
        to: '/configuracoes/distribuicao' as const,
        search: {},
      };
    default:
      return {
        rotulo: 'Procurar na classificação dos exames',
        to: '/configuracoes/catalogo' as const,
        search: { aba: `${tipo}s` as const, busca: valor },
      };
  }
}

/** Avisos pendentes para o contador do menu: atualiza a cada 2 min, nunca com a aba oculta. */
export function useTotalAvisosPendentes(ativo: boolean): number | undefined {
  return useQuery({
    ...avisosControllerListarQueryOptions({ query: { status: 'pendente', porPagina: 1 } }),
    enabled: ativo,
    refetchInterval: 2 * 60_000,
    refetchIntervalInBackground: false,
    select: (pagina) => pagina.total,
  }).data;
}
