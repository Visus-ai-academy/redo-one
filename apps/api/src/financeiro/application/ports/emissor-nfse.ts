import type { Segredo } from '../../domain/segredo';

/**
 * Emissor de NFS-e (Focus NFe, NFS-e Nacional). Fala com o emissor em nome dos contratados (as
 * empresas próprias que emitem a nota). Chamadas de rede: use só dentro de jobs, nunca na
 * requisição. Adaptadores: `FocusNfeEmissor` (de verdade) e `SimuladorEmissorNfse` (memória).
 */
export const EMISSOR_NFSE = Symbol('EMISSOR_NFSE');

export interface EmissorNfse {
  /** Cadastra a empresa no emissor ou, se o CNPJ já está lá, atualiza o cadastro. */
  salvarEmpresa(dados: DadosEmpresaEmissora): Promise<EmpresaEmissora>;
  /** `null` se o CNPJ não está cadastrado no emissor. */
  consultarEmpresa(cnpj: string): Promise<EmpresaEmissora | null>;
  /**
   * Envia a nota para autorização. A autorização é assíncrona: a resposta normal é `processando`,
   * e o resultado sai em `consultarNfse`. A referência é a chave da nota no emissor (única por
   * nota; reenviar a mesma referência é recusado).
   */
  emitirNfse(referencia: string, nota: NotaFiscalServico): Promise<SituacaoNfse>;
  /** `null` se a referência não existe no emissor. */
  consultarNfse(cnpjPrestador: string, referencia: string): Promise<SituacaoNfse | null>;
  /** Só nota autorizada pode ser cancelada, e o cancelamento não se desfaz. */
  cancelarNfse(
    cnpjPrestador: string,
    referencia: string,
    justificativa: string,
  ): Promise<SituacaoNfse>;
}

export type AmbienteNfse = 'homologacao' | 'producao';

/** Regime tributário do cadastro da empresa no emissor. */
export type RegimeTributario =
  | 'simples_nacional'
  | 'simples_nacional_excesso_sublimite'
  | 'regime_normal'
  | 'mei';

export interface EnderecoEmpresa {
  logradouro: string;
  numero: string;
  complemento: string | null;
  bairro: string;
  /** Nome do município. */
  municipio: string;
  uf: string;
  cep: string;
}

/** Certificado digital A1 (PFX/P12). Vai direto ao emissor: nunca é guardado nem logado. */
export interface CertificadoA1 {
  arquivoBase64: string;
  senha: string;
}

export interface DadosEmpresaEmissora {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  /** `null` apaga a inscrição no emissor (o município pode recusar a nota que a leva). */
  inscricaoMunicipal: string | null;
  regimeTributario: RegimeTributario;
  endereco: EnderecoEmpresa;
  email: string | null;
  telefone: string | null;
  /** O próprio emissor manda a nota autorizada por e-mail ao tomador. */
  enviarEmailTomador: boolean;
  /** Só quando for trocar o certificado; sem ele, o instalado no emissor fica. */
  certificado?: CertificadoA1;
}

export interface EmpresaEmissora {
  /** Id da empresa no emissor. */
  id: string;
  cnpj: string;
  razaoSocial: string | null;
  /** `null` se não há certificado instalado. */
  certificado: {
    /** CNPJ de quem o certificado pertence. */
    cnpjTitular: string | null;
    validoDe: Date | null;
    validoAte: Date | null;
  } | null;
  /** NFS-e Nacional habilitada em cada ambiente. */
  habilitada: Record<AmbienteNfse, boolean>;
  /** Tokens da empresa por ambiente, quando o emissor os devolve. Não guarde no banco. */
  tokens: Record<AmbienteNfse, Segredo | null>;
}

export type OpcaoSimplesNacional = 'nao_optante' | 'mei' | 'me_epp';

export interface EnderecoTomador {
  logradouro: string;
  numero: string;
  bairro: string;
  /** Código IBGE do município (7 dígitos). */
  codigoMunicipio: string;
  cep: string;
}

/** Grupo IBS/CBS da reforma tributária. Vai inteiro ou não vai (o XSD nacional exige os três). */
export interface IbsCbs {
  /** cIndOp, 6 dígitos (Anexo VII). */
  codigoIndicadorOperacao: string;
  /** CST de IBS/CBS, 3 dígitos. */
  situacaoTributaria: string;
  /** cClassTrib, 6 dígitos. */
  classificacaoTributaria: string;
  consumidorFinal: boolean;
  /** O destinatário é outro, não o tomador. */
  destinatarioDistinto: boolean;
}

/**
 * Nota de serviço no layout da NFS-e Nacional. Os códigos fiscais (`tributacaoIss`,
 * `regimeEspecialTributacao` etc.) vão como estão na tabela nacional: vêm da configuração do
 * financeiro, não deste adaptador.
 */
export interface NotaFiscalServico {
  dataEmissao: Date;
  /** Dia da competência, `AAAA-MM-DD`. */
  dataCompetencia: string;
  prestador: {
    cnpj: string;
    /** Código IBGE do município emissor. */
    codigoMunicipio: string;
    /** `null`: não vai na nota (e o emissor usa a do cadastro da empresa, se houver). */
    inscricaoMunicipal: string | null;
    opcaoSimplesNacional: OpcaoSimplesNacional;
    /** Só para optante do Simples (ME/EPP): 1, 2 ou 3. */
    regimeApuracaoSimplesNacional: number | null;
    regimeEspecialTributacao: number;
  };
  tomador: {
    documento: { tipo: 'cnpj' | 'cpf'; numero: string };
    razaoSocial: string;
    email: string | null;
    telefone: string | null;
    endereco: EnderecoTomador | null;
  };
  servico: {
    codigoMunicipioPrestacao: string;
    codigoTributacaoNacional: string;
    codigoTributacaoMunicipal: string | null;
    /** cNBS, 9 dígitos sem pontos (exigido quando a nota declara IBS/CBS). */
    codigoNbs: string | null;
    descricao: string;
    valorCentavos: number;
    tributacaoIss: number;
    tipoRetencaoIss: number;
    /** Alíquota do ISS em %, quando o município pede. */
    aliquotaIssPct: number | null;
  };
  ibsCbs: IbsCbs | null;
}

export type StatusNfse =
  | 'processando'
  | 'autorizada'
  | 'erro_autorizacao'
  | 'negada'
  | 'cancelada'
  | 'erro_cancelamento';

/** Motivo de uma recusa, como o emissor ou o portal nacional deu (ex.: `E0310`). */
export interface ErroFiscal {
  codigo: string | null;
  mensagem: string;
  correcao: string | null;
  campo: string | null;
}

export interface SituacaoNfse {
  referencia: string;
  status: StatusNfse;
  numero: string | null;
  codigoVerificacao: string | null;
  dataEmissao: Date | null;
  protocolo: string | null;
  urlNota: string | null;
  urlDanfse: string | null;
  urlXml: string | null;
  urlXmlCancelamento: string | null;
  /** Motivos de `erro_autorizacao` e `erro_cancelamento`. */
  erros: ErroFiscal[];
}

/**
 * `credencial`: o emissor recusou o token (401/403), problema de configuração; `nao_encontrado`:
 * empresa ou nota inexistente; `recusada`: dados recusados (400/422), com os motivos em `erros`;
 * `indisponivel`: sem resposta, tempo esgotado, 429 ou 5xx (vale tentar de novo);
 * `resposta_inesperada`: corpo fora do formato documentado.
 */
export type TipoErroEmissor =
  | 'credencial'
  | 'nao_encontrado'
  | 'recusada'
  | 'indisponivel'
  | 'resposta_inesperada';

/** Falha numa chamada ao emissor. A mensagem nunca traz token, certificado nem senha. */
export class ErroEmissorNfse extends Error {
  constructor(
    readonly tipo: TipoErroEmissor,
    mensagem: string,
    readonly status: number | null = null,
    readonly erros: ErroFiscal[] = [],
  ) {
    super(mensagem);
    this.name = 'ErroEmissorNfse';
  }

  /** Vale tentar de novo mais tarde (o job pode reagendar). */
  get temporario(): boolean {
    return this.tipo === 'indisponivel';
  }
}
