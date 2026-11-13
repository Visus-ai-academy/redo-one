import type { Email } from '../../comum/email/envio-email';
import type { NovoTokenSenha } from '../senha/tokens-senha.repository';

export const GESTAO_USUARIOS_REPOSITORY = Symbol('GESTAO_USUARIOS_REPOSITORY');

/** Derivada, nunca gravada: desativado > convite pendente (sem senha) > bloqueado > ativo. */
export type SituacaoUsuario = 'ativo' | 'convite_pendente' | 'bloqueado' | 'desativado';

export interface FiltroUsuarios {
  /** Parte do nome, do e-mail ou o CPF (só dígitos). */
  busca?: string;
  papelId?: string;
  situacao?: SituacaoUsuario;
  pagina: number;
  porPagina: number;
  /** Referência para saber quem está bloqueado agora. */
  agora: Date;
}

export interface UsuarioResumo {
  id: string;
  nome: string;
  email: string;
  papel: { id: string; nome: string };
  situacao: SituacaoUsuario;
  /** Último uso de sessão; nulo para quem nunca entrou. */
  ultimoAcessoEm: Date | null;
}

export interface SessaoAbertaResumo {
  id: string;
  ip: string | null;
  userAgent: string | null;
  criadaEm: Date;
  ultimoUsoEm: Date;
}

export interface UsuarioDetalhe extends UsuarioResumo {
  /** Só os 2 últimos dígitos do CPF; o número inteiro nunca sai da API. */
  cpfFinal: string | null;
  bloqueadoAte: Date | null;
  criadoEm: Date;
  sessoesAbertas: SessaoAbertaResumo[];
}

export interface NovoUsuario {
  nome: string;
  email: string;
  cpf: string | null;
  papelId: string;
}

export interface GestaoUsuariosRepository {
  listar(filtro: FiltroUsuarios): Promise<{ itens: UsuarioResumo[]; total: number }>;
  buscar(id: string, agora: Date): Promise<UsuarioDetalhe | null>;
  existeEmail(email: string): Promise<boolean>;
  existeCpf(cpf: string): Promise<boolean>;
  /** Numa transação: cria o usuário sem senha, grava o token do convite e enfileira o e-mail. */
  convidar(
    novo: NovoUsuario,
    token: Omit<NovoTokenSenha, 'usuarioId'>,
    email: (usuarioId: string) => Email,
  ): Promise<string>;
  trocarPapel(id: string, papelId: string): Promise<void>;
  definirAtivo(id: string, ativo: boolean): Promise<void>;
  desbloquear(id: string): Promise<void>;
}
