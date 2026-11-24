import type { TipoAviso } from './preparar-laudo';

/** Quem consulta os avisos: as permissões do papel, ou acesso total (Administrador). */
export interface AcessoAvisos {
  acessoTotal: boolean;
  permissoes: ReadonlySet<string>;
}

/**
 * O aviso de um tipo só aparece para quem vê a tela onde ele se resolve (a mesma do atalho
 * "Procurar em..."): sem a tela Médicos, nada de aviso de médico.
 */
const PERMISSAO_DO_TIPO: Readonly<Record<TipoAviso, string>> = {
  cliente: 'clientes.ver',
  medico: 'medicos.ver',
  estudo: 'exames.ver',
  // Modalidade, especialidade e prioridade: o apelido entra na aba do Catálogo.
  modalidade: 'catalogo.ver',
  especialidade: 'catalogo.ver',
  prioridade: 'catalogo.ver',
  // A grafia entra no de-para das prioridades da operação (Configurações › Distribuição).
  prioridade_operacao: 'distribuicao-config.ver',
  // A conta é liberada na MobileMed, ou a certa entra nas outras contas do médico (tela Médicos).
  conta_unidade: 'medicos.ver',
};

const TIPOS = Object.keys(PERMISSAO_DO_TIPO) as TipoAviso[];

/** Os tipos de aviso que esse acesso pode ver, listar e triar. */
export function tiposDeAvisoVisiveis(acesso: AcessoAvisos): TipoAviso[] {
  if (acesso.acessoTotal) return [...TIPOS];
  return TIPOS.filter((tipo) => acesso.permissoes.has(PERMISSAO_DO_TIPO[tipo]));
}
