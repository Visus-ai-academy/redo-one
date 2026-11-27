import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DadosEmpresaEmissora, NotaFiscalServico } from '../../application/ports/emissor-nfse';
import { FocusNfeEmissor } from './focus-nfe-emissor';

const TOKEN_MESTRE = 'mestre-secreto';
const TOKEN_HOMOLOGACAO = 'empresa-hom-secreto';
const CERTIFICADO = 'Q0VSVElGSUNBRE8tU0VDUkVUTw==';
const SENHA = 'senha-do-certificado';
const CNPJ = '12345678000190';

const basic = (token: string) => `Basic ${Buffer.from(`${token}:`).toString('base64')}`;

interface Chamada {
  metodo: string;
  url: string;
  auth: string | null;
  corpo: unknown;
}

type Resposta = { status: number; corpo?: unknown; texto?: string };

/** Fetch falso: responde em ordem e registra as chamadas. Nenhum teste sai para a rede. */
function fetchFalso(respostas: (Resposta | Error)[]) {
  const chamadas: Chamada[] = [];
  const fila = [...respostas];
  const fn = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    chamadas.push({
      metodo: init?.method ?? 'GET',
      url: String(url),
      auth: headers.get('authorization'),
      corpo: typeof init?.body === 'string' ? JSON.parse(init.body) : undefined,
    });
    const proxima = fila.shift();
    if (!proxima) throw new Error('chamada inesperada');
    if (proxima instanceof Error) throw proxima;
    const texto =
      proxima.texto ?? (proxima.corpo === undefined ? '' : JSON.stringify(proxima.corpo));
    return new Response(texto, { status: proxima.status });
  });
  return { fetch: fn as unknown as typeof fetch, chamadas };
}

const empresaFocus = {
  id: 77,
  cnpj: CNPJ,
  nome: 'Teleimagem Ltda',
  certificado_cnpj: CNPJ,
  certificado_valido_ate: '2027-01-10T00:00:00-03:00',
  habilita_nfsen_homologacao: true,
  token_producao: 'empresa-prod-secreto',
  token_homologacao: TOKEN_HOMOLOGACAO,
};

const dadosEmpresa: DadosEmpresaEmissora = {
  cnpj: '12.345.678/0001-90',
  razaoSocial: 'Teleimagem Ltda',
  nomeFantasia: 'Teleimagem',
  inscricaoMunicipal: null,
  regimeTributario: 'regime_normal',
  endereco: {
    logradouro: 'Rua A',
    numero: '100',
    complemento: null,
    bairro: 'Centro',
    municipio: 'Curitiba',
    uf: 'PR',
    cep: '80000000',
  },
  email: null,
  telefone: null,
  enviarEmailTomador: true,
  certificado: { arquivoBase64: CERTIFICADO, senha: SENHA },
};

const nota: NotaFiscalServico = {
  dataEmissao: new Date('2026-11-27T15:30:00Z'),
  dataCompetencia: '2026-11-01',
  prestador: {
    cnpj: CNPJ,
    codigoMunicipio: '4106902',
    inscricaoMunicipal: null,
    opcaoSimplesNacional: 'nao_optante',
    regimeApuracaoSimplesNacional: null,
    regimeEspecialTributacao: 0,
  },
  tomador: {
    documento: { tipo: 'cnpj', numero: '98765432000110' },
    razaoSocial: 'Clínica Exemplo',
    email: null,
    telefone: null,
    endereco: null,
  },
  servico: {
    codigoMunicipioPrestacao: '4106902',
    codigoTributacaoNacional: '040301',
    codigoTributacaoMunicipal: null,
    codigoNbs: null,
    descricao: 'Laudos',
    valorCentavos: 10_000,
    tributacaoIss: 1,
    tipoRetencaoIss: 1,
    aliquotaIssPct: null,
  },
  ibsCbs: null,
};

const emissor = (f: typeof fetch, ambiente: 'homologacao' | 'producao' = 'homologacao') =>
  new FocusNfeEmissor({ tokenMestre: TOKEN_MESTRE, ambiente, fetch: f, timeoutMs: 1_000 });

const logs: string[] = [];
beforeEach(() => {
  logs.length = 0;
  for (const nivel of ['log', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(Logger.prototype, nivel).mockImplementation((...args: unknown[]) => {
      logs.push(JSON.stringify(args));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

const semSegredosNosLogs = () => {
  for (const segredo of [TOKEN_MESTRE, TOKEN_HOMOLOGACAO, CERTIFICADO, SENHA, 'empresa-prod']) {
    expect(logs.join('\n')).not.toContain(segredo);
  }
};

describe('FocusNfeEmissor — empresa', () => {
  it('cadastra a empresa que o CNPJ ainda não tem, sempre na API de produção', async () => {
    const { fetch, chamadas } = fetchFalso([
      { status: 200, corpo: [] },
      { status: 200, corpo: empresaFocus },
    ]);

    const empresa = await emissor(fetch).salvarEmpresa(dadosEmpresa);

    expect(chamadas.map((c) => [c.metodo, c.url])).toEqual([
      ['GET', `https://api.focusnfe.com.br/v2/empresas?cnpj=${CNPJ}`],
      ['POST', 'https://api.focusnfe.com.br/v2/empresas'],
    ]);
    expect(chamadas.every((c) => c.auth === basic(TOKEN_MESTRE))).toBe(true);
    expect(chamadas[1]?.corpo).toMatchObject({
      cnpj: CNPJ,
      habilita_nfsen_homologacao: true,
      arquivo_certificado_base64: CERTIFICADO,
      senha_certificado: SENHA,
    });
    expect(empresa).toMatchObject({ id: '77', certificado: { cnpjTitular: CNPJ } });
    semSegredosNosLogs();
  });

  it('atualiza pelo id da Focus quando o CNPJ já está cadastrado', async () => {
    const { fetch, chamadas } = fetchFalso([
      { status: 200, corpo: [{ id: 77, cnpj: CNPJ }] },
      { status: 200, corpo: empresaFocus },
    ]);

    await emissor(fetch).salvarEmpresa(dadosEmpresa);

    expect(chamadas[1]).toMatchObject({
      metodo: 'PUT',
      url: 'https://api.focusnfe.com.br/v2/empresas/77',
    });
  });

  it('recusa do certificado chega com o motivo e o campo, sem vazar o certificado no log', async () => {
    const { fetch } = fetchFalso([
      { status: 200, corpo: [] },
      {
        status: 422,
        corpo: {
          codigo: 'erro_validacao',
          erros: [
            {
              codigo: 'erro_validacao',
              mensagem: 'Certificado com prazo de validade vencido',
              campo: 'arquivo_certificado_base64',
            },
          ],
        },
      },
    ]);

    const erro = await emissor(fetch)
      .salvarEmpresa(dadosEmpresa)
      .catch((e: unknown) => e);

    expect(erro).toMatchObject({ tipo: 'recusada', status: 422 });
    expect((erro as Error).message).toContain('prazo de validade vencido');
    expect((erro as Error).message).not.toContain(CERTIFICADO);
    semSegredosNosLogs();
  });

  it('token mestre recusado (401 em HTML) vira erro de credencial', async () => {
    const { fetch } = fetchFalso([{ status: 401, texto: 'HTTP Basic: Access denied.' }]);
    await expect(emissor(fetch).salvarEmpresa(dadosEmpresa)).rejects.toMatchObject({
      tipo: 'credencial',
    });
  });

  it('consulta devolve o certificado e os tokens protegidos', async () => {
    const { fetch, chamadas } = fetchFalso([
      { status: 200, corpo: [{ id: 77, cnpj: CNPJ }] },
      { status: 200, corpo: empresaFocus },
    ]);

    const empresa = await emissor(fetch).consultarEmpresa('12.345.678/0001-90');

    expect(chamadas[1]?.url).toBe('https://api.focusnfe.com.br/v2/empresas/77');
    expect(empresa?.certificado?.validoAte).toEqual(new Date('2027-01-10T03:00:00Z'));
    expect(empresa?.tokens.homologacao?.revelar()).toBe(TOKEN_HOMOLOGACAO);
  });

  it('consulta de CNPJ que não está no emissor devolve null', async () => {
    const { fetch } = fetchFalso([{ status: 200, corpo: [] }]);
    await expect(emissor(fetch).consultarEmpresa(CNPJ)).resolves.toBeNull();
  });
});

describe('FocusNfeEmissor — NFS-e', () => {
  const comEmpresa = (): Resposta[] => [
    { status: 200, corpo: [{ id: 77, cnpj: CNPJ }] },
    { status: 200, corpo: empresaFocus },
  ];

  it('emite no host do ambiente com o token da empresa, achado uma vez só', async () => {
    const { fetch, chamadas } = fetchFalso([
      ...comEmpresa(),
      { status: 202, corpo: { ref: 'fat-1', status: 'processando_autorizacao', protocolo: 'p1' } },
      { status: 202, corpo: { ref: 'fat-2', status: 'processando_autorizacao' } },
    ]);
    const focus = emissor(fetch);

    const situacao = await focus.emitirNfse('fat-1', nota);
    await focus.emitirNfse('fat-2', nota);

    expect(chamadas[2]).toMatchObject({
      metodo: 'POST',
      url: 'https://homologacao.focusnfe.com.br/v2/nfsen?ref=fat-1',
      auth: basic(TOKEN_HOMOLOGACAO),
    });
    expect(chamadas[2]?.corpo).toMatchObject({ cnpj_prestador: CNPJ, valor_servico: 100 });
    expect(chamadas).toHaveLength(4);
    expect(situacao).toMatchObject({ status: 'processando', protocolo: 'p1' });
    semSegredosNosLogs();
  });

  it('em produção usa o host e o token de produção', async () => {
    const { fetch, chamadas } = fetchFalso([
      ...comEmpresa(),
      { status: 202, corpo: { ref: 'fat-1', status: 'processando_autorizacao' } },
    ]);

    await emissor(fetch, 'producao').emitirNfse('fat-1', nota);

    expect(chamadas[2]).toMatchObject({
      url: 'https://api.focusnfe.com.br/v2/nfsen?ref=fat-1',
      auth: basic('empresa-prod-secreto'),
    });
  });

  it('sem token da empresa na resposta, usa o token mestre', async () => {
    const { fetch, chamadas } = fetchFalso([
      { status: 200, corpo: [{ id: 77, cnpj: CNPJ }] },
      { status: 200, corpo: { ...empresaFocus, token_homologacao: '' } },
      { status: 202, corpo: { ref: 'fat-1', status: 'processando_autorizacao' } },
    ]);

    await emissor(fetch).emitirNfse('fat-1', nota);

    expect(chamadas[2]?.auth).toBe(basic(TOKEN_MESTRE));
  });

  it('prestador sem empresa no emissor é recusado antes de emitir', async () => {
    const { fetch, chamadas } = fetchFalso([{ status: 200, corpo: [] }]);
    await expect(emissor(fetch).emitirNfse('fat-1', nota)).rejects.toMatchObject({
      tipo: 'nao_encontrado',
    });
    expect(chamadas).toHaveLength(1);
  });

  it('recusa da API ({ codigo, mensagem }) chega como erros[]', async () => {
    const { fetch } = fetchFalso([
      ...comEmpresa(),
      {
        status: 400,
        corpo: { codigo: 'empresa_nao_habilitada', mensagem: 'Ative habilita_nfsen_homologacao' },
      },
    ]);
    const erro = await emissor(fetch)
      .emitirNfse('fat-1', nota)
      .catch((e: unknown) => e);
    expect(erro).toMatchObject({
      tipo: 'recusada',
      erros: [expect.objectContaining({ codigo: 'empresa_nao_habilitada' })],
    });
  });

  it('consulta a nota autorizada', async () => {
    const { fetch, chamadas } = fetchFalso([
      ...comEmpresa(),
      {
        status: 200,
        corpo: {
          ref: 'fat-1',
          status: 'autorizado',
          numero: '42',
          caminho_xml_nota_fiscal: '/x.xml',
        },
      },
    ]);

    const situacao = await emissor(fetch).consultarNfse(CNPJ, 'fat-1');

    expect(chamadas[2]).toMatchObject({
      metodo: 'GET',
      url: 'https://homologacao.focusnfe.com.br/v2/nfsen/fat-1',
    });
    expect(situacao).toMatchObject({
      status: 'autorizada',
      numero: '42',
      urlXml: 'https://homologacao.focusnfe.com.br/x.xml',
    });
  });

  it('consulta de referência inexistente devolve null', async () => {
    const { fetch } = fetchFalso([
      ...comEmpresa(),
      { status: 404, corpo: { codigo: 'nao_encontrado', mensagem: 'Nota fiscal não encontrada' } },
    ]);
    await expect(emissor(fetch).consultarNfse(CNPJ, 'fat-x')).resolves.toBeNull();
  });

  it('cancela com a justificativa no corpo do DELETE', async () => {
    const { fetch, chamadas } = fetchFalso([
      ...comEmpresa(),
      { status: 200, corpo: { ref: 'fat-1', status: 'cancelado' } },
    ]);

    const situacao = await emissor(fetch).cancelarNfse(
      CNPJ,
      'fat-1',
      'Nota emitida com valor errado',
    );

    expect(chamadas[2]).toMatchObject({
      metodo: 'DELETE',
      url: 'https://homologacao.focusnfe.com.br/v2/nfsen/fat-1',
      corpo: { justificativa: 'Nota emitida com valor errado' },
    });
    expect(situacao.status).toBe('cancelada');
  });

  it('justificativa curta é recusada sem chamar a Focus', async () => {
    const { fetch, chamadas } = fetchFalso([]);
    await expect(emissor(fetch).cancelarNfse(CNPJ, 'fat-1', 'errada')).rejects.toThrow(/15 a 255/);
    expect(chamadas).toHaveLength(0);
  });

  it('token da empresa recusado (401) é esquecido e buscado de novo na próxima chamada', async () => {
    const { fetch, chamadas } = fetchFalso([
      ...comEmpresa(),
      { status: 401, texto: 'HTTP Basic: Access denied.' },
      ...comEmpresa(),
      { status: 200, corpo: { ref: 'fat-1', status: 'autorizado' } },
    ]);
    const focus = emissor(fetch);

    await expect(focus.consultarNfse(CNPJ, 'fat-1')).rejects.toMatchObject({ tipo: 'credencial' });
    await focus.consultarNfse(CNPJ, 'fat-1');

    expect(chamadas).toHaveLength(6);
  });
});

describe('FocusNfeEmissor — falhas de rede', () => {
  it('sem resposta vira indisponível (temporário)', async () => {
    const { fetch } = fetchFalso([new TypeError('fetch failed')]);
    const erro = await emissor(fetch)
      .consultarEmpresa(CNPJ)
      .catch((e: unknown) => e);
    expect(erro).toMatchObject({ tipo: 'indisponivel', temporario: true });
  });

  it('tempo esgotado vira indisponível', async () => {
    const lento = vi.fn(
      (_url: string | URL, init?: RequestInit) =>
        new Promise<Response>((_ok, falha) => {
          init?.signal?.addEventListener('abort', () => falha(init.signal?.reason));
        }),
    ) as unknown as typeof fetch;
    const focus = new FocusNfeEmissor({
      tokenMestre: TOKEN_MESTRE,
      ambiente: 'homologacao',
      fetch: lento,
      timeoutMs: 10,
    });
    await expect(focus.consultarEmpresa(CNPJ)).rejects.toMatchObject({ tipo: 'indisponivel' });
  });

  it('5xx vira indisponível', async () => {
    const { fetch } = fetchFalso([{ status: 502, texto: '<html>Bad gateway</html>' }]);
    await expect(emissor(fetch).consultarEmpresa(CNPJ)).rejects.toMatchObject({
      tipo: 'indisponivel',
      status: 502,
    });
  });

  it('2xx com corpo que não é JSON vira resposta inesperada', async () => {
    const { fetch } = fetchFalso([{ status: 200, texto: '<html></html>' }]);
    await expect(emissor(fetch).consultarEmpresa(CNPJ)).rejects.toMatchObject({
      tipo: 'resposta_inesperada',
    });
  });
});
