import type { clientesDadosFiscais } from '../database/schema';
import { montarResolvedorUnidadeCliente } from '../ingestao/domain/resolver-cliente';
import { type Aviso, idDoLegado, texto } from './comum';
import type { LegadoDadosFiscais } from './legado';
import type { CatalogoMigrado } from './mapear-catalogo';

type Tabelas = CatalogoMigrado['tabelas'];

/** O que a carga usa do catálogo migrado: os clientes e o que resolve o nome da MobileMed. */
export interface CadastroParaDadosFiscais {
  clientes: Pick<
    Tabelas['clientes'][number],
    'id' | 'nome' | 'chaveNormalizada' | 'nomeFantasia' | 'unificadoEmId'
  >[];
  clientesAliases: Pick<
    Tabelas['clientesAliases'][number],
    'tipo' | 'chave' | 'padrao' | 'clienteId'
  >[];
  sufixosNomeCliente: Pick<Tabelas['sufixosNomeCliente'][number], 'sufixo' | 'ativo'>[];
}

type Linha = typeof clientesDadosFiscais.$inferInsert;

export interface DadosFiscaisMigrados {
  tabelas: { clientesDadosFiscais: Linha[] };
  avisos: Aviso[];
  /**
   * Clientes do cadastro sem linha nesta carga (os principais criados na carga): a gravação só
   * desmarca a exclusão fiscal deles, que pode ter vindo de uma carga anterior; o resto fica.
   */
  desmarcarExclusaoFiscal: string[];
  /** Cada nome da exclusão fiscal e o cliente a que chegou (nulo = não resolveu). */
  exclusaoFiscal: { nome: string; cliente: string | null }[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CORRIGIR = 'veio como está; a tela pede para corrigir ao salvar.';

/** `emailEnvioNf`: separado por `,`, `;` ou espaço; sem vazios e sem repetidos, na ordem. */
function separarEmails(valor: string | null): string[] {
  const vistos = new Set<string>();
  const emails: string[] = [];
  for (const email of (valor ?? '').split(/[,;\s]+/)) {
    if (!email || vistos.has(email.toLowerCase())) continue;
    vistos.add(email.toLowerCase());
    emails.push(email);
  }
  return emails;
}

/** Só dígitos; 7 dígitos ganham o zero à esquerda (o Excel o comia); o resto vem como está. */
function cepDo(valor: string | null): { cep: string | null; valido: boolean } {
  const bruto = texto(valor);
  if (!bruto) return { cep: null, valido: true };
  const so = bruto.replace(/\D/g, '');
  if (so.length === 8) return { cep: so, valido: true };
  if (so.length === 7) return { cep: `0${so}`, valido: true };
  return { cep: bruto, valido: false };
}

const vazia = (clienteId: string): Linha => ({
  clienteId,
  emailsNf: [],
  email: null,
  contatoNome: null,
  telefone: null,
  cep: null,
  logradouro: null,
  numero: null,
  complemento: null,
  bairro: null,
  cidade: null,
  uf: null,
  bancoCodigo: null,
  bancoAgencia: null,
  bancoConta: null,
  omieCodigoCliente: null,
  omieSincronizadoEm: null,
  exclusaoFiscal: false,
  atualizadoPorId: null,
});

/**
 * A ficha do cliente do dashboards-one que é do faturamento vira `clientes_dados_fiscais`, como
 * está (o dashboards-one é a fonte até a virada; a carga sobrescreve). Um cliente migrado, uma
 * linha. Os nomes da exclusão fiscal são resolvidos para o cadastro pelo nome na MobileMed e
 * pelos apelidos (a unidade fica ela mesma); o nome que não resolve é avisado e fica de fora.
 */
export function mapearDadosFiscais(
  legado: LegadoDadosFiscais,
  cadastro: CadastroParaDadosFiscais,
): DadosFiscaisMigrados {
  const avisos: Aviso[] = [];
  const nomeDe = new Map(cadastro.clientes.map((c) => [c.id, c.nome]));
  const avisar = (clienteId: string, motivo: string) =>
    avisos.push({
      tabela: 'clientes_dados_fiscais',
      item: nomeDe.get(clienteId) ?? clienteId,
      motivo,
    });

  const linhas = new Map<string, Linha>();
  for (const f of legado.clientes) {
    const clienteId = idDoLegado('clientes', f.id);
    if (!nomeDe.has(clienteId)) continue;
    const emailsNf = separarEmails(f.emailEnvioNf);
    // Só a posição: o e-mail é dado de contato e o relatório vai para o terminal.
    emailsNf.forEach((e, i) => {
      if (!EMAIL.test(e))
        avisar(clienteId, `O ${i + 1}º e-mail da NF está fora do formato: ${CORRIGIR}`);
    });
    const { cep, valido } = cepDo(f.cep);
    if (!valido) avisar(clienteId, `CEP "${cep}" sem 8 dígitos: ${CORRIGIR}`);
    linhas.set(clienteId, {
      ...vazia(clienteId),
      emailsNf,
      email: texto(f.email),
      contatoNome: texto(f.contato),
      telefone: texto(f.telefone),
      cep,
      logradouro: texto(f.endereco),
      numero: texto(f.enderecoNumero),
      complemento: texto(f.complemento),
      bairro: texto(f.bairro),
      cidade: texto(f.cidade),
      uf: texto(f.estado)?.toUpperCase() ?? null,
      bancoCodigo: texto(f.bancoCodigo),
      bancoAgencia: texto(f.bancoAgencia),
      bancoConta: texto(f.bancoConta),
      omieCodigoCliente: texto(f.omieCodigoCliente),
      omieSincronizadoEm: f.omieDataSincronizacao ? new Date(f.omieDataSincronizacao) : null,
    });
  }

  const resolver = montarResolvedorUnidadeCliente({
    clientes: cadastro.clientes.map((c) => ({
      id: c.id,
      nome: c.nome,
      chaveNormalizada: c.chaveNormalizada,
      nomeFantasia: c.nomeFantasia ?? null,
      unificadoEmId: c.unificadoEmId ?? null,
    })),
    aliases: cadastro.clientesAliases.map((a) => ({
      tipo: a.tipo,
      chave: a.chave,
      clienteId: a.clienteId,
    })),
    sufixos: cadastro.sufixosNomeCliente.filter((s) => s.ativo !== false).map((s) => s.sufixo),
  });
  const exclusaoFiscal: DadosFiscaisMigrados['exclusaoFiscal'] = [];
  for (const bruto of legado.exclusaoFiscal) {
    const nome = bruto.trim();
    if (!nome) continue;
    const clienteId = resolver(nome);
    exclusaoFiscal.push({ nome, cliente: clienteId ? (nomeDe.get(clienteId) ?? null) : null });
    if (!clienteId) {
      avisos.push({
        tabela: 'clientes_dados_fiscais',
        item: nome,
        motivo: 'Nome da exclusão fiscal sem cliente no redo-one: ficou de fora.',
      });
      continue;
    }
    const linha = linhas.get(clienteId) ?? vazia(clienteId);
    linha.exclusaoFiscal = true;
    linhas.set(clienteId, linha);
  }

  return {
    tabelas: { clientesDadosFiscais: [...linhas.values()] },
    desmarcarExclusaoFiscal: cadastro.clientes.map((c) => c.id).filter((id) => !linhas.has(id)),
    avisos,
    exclusaoFiscal,
  };
}
