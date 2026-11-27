import {
  type AmbienteNfse,
  type DadosEmpresaEmissora,
  type EmpresaEmissora,
  ErroEmissorNfse,
  type ErroFiscal,
  type NotaFiscalServico,
  type OpcaoSimplesNacional,
  type RegimeTributario,
  type SituacaoNfse,
  type StatusNfse,
} from '../../application/ports/emissor-nfse';
import { Segredo } from '../../domain/segredo';

/**
 * Tradução entre o contrato do `EmissorNfse` e a API v2 da Focus NFe (empresas e NFS-e Nacional,
 * `/v2/nfsen`). Nomes e formatos conferidos na documentação (doc.focusnfe.com.br) e no que já
 * funciona em produção no visus-vector-2.0.
 */

type Json = Record<string, unknown>;

export const digitos = (texto: string): string => texto.replace(/\D/g, '');

const texto = (valor: unknown): string | null =>
  typeof valor === 'string' && valor.trim() ? valor.trim() : null;

const data = (valor: unknown): Date | null => {
  const t = texto(valor);
  if (!t) return null;
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
};

const inesperada = (detalhe: string) =>
  new ErroEmissorNfse('resposta_inesperada', `Resposta inesperada da Focus NFe: ${detalhe}.`);

// ─── Empresa ─────────────────────────────────────────────────────────────────

const REGIME: Record<RegimeTributario, string> = {
  simples_nacional: '1',
  simples_nacional_excesso_sublimite: '2',
  regime_normal: '3',
  mei: '4',
};

/**
 * Corpo do `POST /v2/empresas` e do `PUT /v2/empresas/{id}`.
 *
 * - Campo ausente num PUT não apaga o valor no emissor: a inscrição municipal nula vai como `''`
 *   (no Vector, a IM que sobrou no cadastro da empresa fazia toda nota voltar com E0120).
 * - Só o ambiente configurado é habilitado; o outro fica como está. A empresa é uma por CNPJ, e
 *   mandar `false` para o outro desligaria a emissão de quem o usa (incidente de 13/08/2026 no
 *   Vector: uma unidade de teste em homologação desligou a produção da matriz).
 */
export function payloadEmpresa(dados: DadosEmpresaEmissora, ambiente: AmbienteNfse): Json {
  const e = dados.endereco;
  return {
    nome: dados.razaoSocial,
    nome_fantasia: dados.nomeFantasia,
    cnpj: digitos(dados.cnpj),
    inscricao_municipal: dados.inscricaoMunicipal ?? '',
    regime_tributario: REGIME[dados.regimeTributario],
    logradouro: e.logradouro,
    numero: e.numero,
    ...(e.complemento ? { complemento: e.complemento } : {}),
    bairro: e.bairro,
    municipio: e.municipio,
    uf: e.uf,
    cep: digitos(e.cep),
    ...(dados.email ? { email: dados.email } : {}),
    ...(dados.telefone ? { telefone: digitos(dados.telefone) } : {}),
    enviar_email_destinatario: dados.enviarEmailTomador,
    [`habilita_nfsen_${ambiente}`]: true,
    ...(dados.certificado
      ? {
          arquivo_certificado_base64: dados.certificado.arquivoBase64,
          senha_certificado: dados.certificado.senha,
        }
      : {}),
  };
}

const segredo = (valor: unknown): Segredo | null => {
  const t = texto(valor);
  return t ? new Segredo(t) : null;
};

/** Resposta de `GET`/`POST`/`PUT /v2/empresas`. */
export function empresaDaResposta(json: unknown): EmpresaEmissora {
  const r = (json ?? {}) as Json;
  if (typeof r.id !== 'number' && !texto(r.id)) throw inesperada('empresa sem id');
  const cnpjTitular = texto(r.certificado_cnpj);
  const validoDe = data(r.certificado_valido_de);
  const validoAte = data(r.certificado_valido_ate);
  return {
    id: String(r.id),
    cnpj: digitos(texto(r.cnpj) ?? ''),
    razaoSocial: texto(r.nome),
    certificado:
      cnpjTitular || validoDe || validoAte
        ? { cnpjTitular: cnpjTitular ? digitos(cnpjTitular) : null, validoDe, validoAte }
        : null,
    habilitada: {
      producao: r.habilita_nfsen_producao === true,
      homologacao: r.habilita_nfsen_homologacao === true,
    },
    tokens: { producao: segredo(r.token_producao), homologacao: segredo(r.token_homologacao) },
  };
}

// ─── NFS-e Nacional ──────────────────────────────────────────────────────────

const OPCAO_SIMPLES: Record<OpcaoSimplesNacional, string> = {
  nao_optante: '1',
  mei: '2',
  me_epp: '3',
};

/**
 * Data e hora em Brasília com o fuso explícito (`AAAA-MM-DDTHH:mm:ss-03:00`), como a DPS pede.
 * Brasília está fixa em UTC−3 desde o fim do horário de verão (2019).
 */
export function dataHoraBrasilia(instante: Date): string {
  const local = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).format(instante);
  return `${local.replace(' ', 'T')}-03:00`;
}

/** Corpo do `POST /v2/nfsen?ref=`. */
export function payloadNfse(nota: NotaFiscalServico): Json {
  const { prestador: p, tomador: t, servico: s, ibsCbs } = nota;
  const documento = digitos(t.documento.numero);
  const telefone = t.telefone ? digitos(t.telefone) : '';
  return {
    data_emissao: dataHoraBrasilia(nota.dataEmissao),
    data_competencia: nota.dataCompetencia,
    cnpj_prestador: digitos(p.cnpj),
    codigo_municipio_emissora: Number(digitos(p.codigoMunicipio)),
    ...(p.inscricaoMunicipal ? { inscricao_municipal_prestador: p.inscricaoMunicipal } : {}),
    codigo_opcao_simples_nacional: OPCAO_SIMPLES[p.opcaoSimplesNacional],
    ...(p.opcaoSimplesNacional === 'me_epp' && p.regimeApuracaoSimplesNacional !== null
      ? { regime_tributario_simples_nacional: String(p.regimeApuracaoSimplesNacional) }
      : {}),
    regime_especial_tributacao: String(p.regimeEspecialTributacao),
    [t.documento.tipo === 'cpf' ? 'cpf_tomador' : 'cnpj_tomador']: documento,
    razao_social_tomador: t.razaoSocial.trim().replace(/\s+/g, ' '),
    ...(t.email ? { email_tomador: t.email.trim() } : {}),
    // `fone` do tomador: só dígitos, de 6 a 20 (XSD nacional).
    ...(telefone.length >= 6 && telefone.length <= 20 ? { telefone_tomador: telefone } : {}),
    ...(t.endereco
      ? {
          logradouro_tomador: t.endereco.logradouro,
          numero_tomador: t.endereco.numero,
          bairro_tomador: t.endereco.bairro,
          codigo_municipio_tomador: digitos(t.endereco.codigoMunicipio),
          cep_tomador: digitos(t.endereco.cep),
        }
      : {}),
    codigo_municipio_prestacao: digitos(s.codigoMunicipioPrestacao),
    codigo_tributacao_nacional_iss: s.codigoTributacaoNacional,
    ...(s.codigoTributacaoMunicipal
      ? { codigo_tributacao_municipal_iss: s.codigoTributacaoMunicipal }
      : {}),
    ...(s.codigoNbs ? { codigo_nbs: digitos(s.codigoNbs) } : {}),
    descricao_servico: s.descricao,
    valor_servico: s.valorCentavos / 100,
    tributacao_iss: s.tributacaoIss,
    tipo_retencao_iss: s.tipoRetencaoIss,
    ...(s.aliquotaIssPct !== null
      ? { percentual_aliquota_relativa_municipio: s.aliquotaIssPct }
      : {}),
    // O XSD nacional exige o cIndOp assim que o grupo IBS/CBS existe (no Vector, omiti-lo
    // derrubou a emissão de uma clínica): por isso o grupo vai inteiro ou não vai.
    ...(ibsCbs
      ? {
          finalidade_emissao: 0,
          consumidor_final: ibsCbs.consumidorFinal ? 1 : 0,
          indicador_destinatario: ibsCbs.destinatarioDistinto ? 1 : 0,
          codigo_indicador_operacao: ibsCbs.codigoIndicadorOperacao,
          ibs_cbs_situacao_tributaria: ibsCbs.situacaoTributaria,
          ibs_cbs_classificacao_tributaria: ibsCbs.classificacaoTributaria,
        }
      : {}),
  };
}

const STATUS: Record<string, StatusNfse> = {
  processando_autorizacao: 'processando',
  autorizado: 'autorizada',
  erro_autorizacao: 'erro_autorizacao',
  negado: 'negada',
  cancelado: 'cancelada',
  erro_cancelamento: 'erro_cancelamento',
};

/** A Focus manda o XML como caminho relativo ao host da API; `url`/`url_danfse` já vêm absolutos. */
const absoluta = (caminho: unknown, baseUrl: string): string | null => {
  const t = texto(caminho);
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  return `${baseUrl}${t.startsWith('/') ? '' : '/'}${t}`;
};

/** Resposta de `POST`/`GET`/`DELETE /v2/nfsen`. */
export function situacaoDaResposta(json: unknown, baseUrl: string): SituacaoNfse {
  const r = (json ?? {}) as Json;
  const status = STATUS[String(r.status)];
  if (!status) throw inesperada('situação da nota desconhecida');
  return {
    referencia: texto(r.ref) ?? '',
    status,
    numero: texto(r.numero),
    codigoVerificacao: texto(r.codigo_verificacao),
    dataEmissao: data(r.data_emissao),
    protocolo: texto(r.protocolo),
    urlNota: absoluta(r.url, baseUrl),
    urlDanfse: absoluta(r.url_danfse, baseUrl),
    urlXml: absoluta(r.caminho_xml_nota_fiscal, baseUrl),
    urlXmlCancelamento: absoluta(r.caminho_xml_cancelamento, baseUrl),
    erros: errosFiscais(r.erros),
  };
}

// ─── Erros ───────────────────────────────────────────────────────────────────

function errosFiscais(lista: unknown): ErroFiscal[] {
  if (!Array.isArray(lista)) return [];
  return lista.flatMap((item) => {
    const e = (item ?? {}) as Json;
    const mensagem = texto(e.mensagem);
    if (!mensagem) return [];
    return [
      {
        codigo: texto(e.codigo),
        mensagem,
        correcao: texto(e.correcao),
        campo: texto(e.campo),
      },
    ];
  });
}

/**
 * A Focus recusa de dois jeitos: `{ erros: [...] }` (portal nacional, ou validação do cadastro de
 * empresa, com `campo`) e `{ codigo, mensagem }` (a própria API, antes de a DPS existir, ex.:
 * `empresa_nao_habilitada`). Os dois viram o mesmo `erros[]`, para o motivo real chegar à tela.
 */
export function errosDoCorpo(json: unknown): ErroFiscal[] {
  const r = (json ?? {}) as Json;
  const lista = errosFiscais(r.erros);
  if (lista.length) return lista;
  const mensagem = texto(r.mensagem) ?? texto(r.message);
  return mensagem ? [{ codigo: texto(r.codigo), mensagem, correcao: null, campo: null }] : [];
}

/** Erro de uma resposta HTTP não 2xx da Focus. A mensagem nunca repete o corpo cru. */
export function erroDaResposta(status: number, json: unknown): ErroEmissorNfse {
  const erros = errosDoCorpo(json);
  if (status === 401 || status === 403) {
    return new ErroEmissorNfse(
      'credencial',
      'A Focus NFe recusou o token. Confira FOCUS_NFE_TOKEN e FOCUS_NFE_AMBIENTE no ambiente da API.',
      status,
      erros,
    );
  }
  if (status === 404) {
    return new ErroEmissorNfse('nao_encontrado', 'Não encontrado na Focus NFe.', status, erros);
  }
  if (status === 429 || status >= 500) {
    return new ErroEmissorNfse(
      'indisponivel',
      `A Focus NFe não está respondendo (HTTP ${status}). Tente de novo em instantes.`,
      status,
      erros,
    );
  }
  const motivos = erros.map((e) => [e.codigo, e.mensagem].filter(Boolean).join(': ')).join(' | ');
  return new ErroEmissorNfse(
    'recusada',
    motivos
      ? `A Focus NFe recusou: ${motivos}`
      : `A Focus NFe recusou sem dizer o motivo (HTTP ${status}).`,
    status,
    erros,
  );
}
