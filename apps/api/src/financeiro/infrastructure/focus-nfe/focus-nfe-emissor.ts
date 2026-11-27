import { Logger } from '@nestjs/common';

import {
  type AmbienteNfse,
  type DadosEmpresaEmissora,
  type EmissorNfse,
  type EmpresaEmissora,
  ErroEmissorNfse,
  type NotaFiscalServico,
  type SituacaoNfse,
} from '../../application/ports/emissor-nfse';
import { justificativaCancelamento } from '../../domain/justificativa-cancelamento';
import {
  digitos,
  empresaDaResposta,
  erroDaResposta,
  payloadEmpresa,
  payloadNfse,
  situacaoDaResposta,
} from './mapeamento-focus';

const HOST: Record<AmbienteNfse, string> = {
  producao: 'https://api.focusnfe.com.br',
  homologacao: 'https://homologacao.focusnfe.com.br',
};

export interface OpcoesFocusNfe {
  /** `FOCUS_NFE_TOKEN`: token da conta (revenda), o único que gerencia empresas. */
  tokenMestre: string;
  /** `FOCUS_NFE_AMBIENTE`: onde as notas são emitidas. */
  ambiente: AmbienteNfse;
  /** Prazo de cada chamada. */
  timeoutMs: number;
  /** Injetado nos testes: nenhum teste fala com a Focus. */
  fetch?: typeof fetch;
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';

/**
 * Emissor de NFS-e pela Focus NFe (API v2, NFS-e Nacional).
 *
 * - Empresas: a API de gestão existe só em produção, então cadastro e consulta vão sempre para
 *   `api.focusnfe.com.br` com o token mestre, mesmo com o ambiente em homologação.
 * - Notas: vão para o host do ambiente, com o token da empresa daquele ambiente. O token é achado
 *   pela consulta da empresa e fica só na memória do processo (credencial de saída não vai para o
 *   banco); sem ele, vale o token mestre (como no visus-vector-2.0).
 * - Log: só a operação, o status HTTP e os códigos de erro. Nunca token, certificado, senha,
 *   corpo da requisição ou mensagem do emissor (pode ecoar dados do tomador).
 */
export class FocusNfeEmissor implements EmissorNfse {
  private readonly logger = new Logger('FocusNFe');
  private readonly fetch: typeof fetch;
  private readonly tokensEmpresa = new Map<string, string>();

  constructor(private readonly o: OpcoesFocusNfe) {
    this.fetch = o.fetch ?? globalThis.fetch;
  }

  async salvarEmpresa(dados: DadosEmpresaEmissora): Promise<EmpresaEmissora> {
    const cnpj = digitos(dados.cnpj);
    const id = await this.idDaEmpresa(cnpj);
    const corpo = payloadEmpresa(dados, this.o.ambiente);
    const resposta = id
      ? await this.gestao(
          'PUT',
          `/v2/empresas/${encodeURIComponent(id)}`,
          'atualizar empresa',
          corpo,
        )
      : await this.gestao('POST', '/v2/empresas', 'cadastrar empresa', corpo);
    const empresa = empresaDaResposta(resposta);
    this.lembrarToken(cnpj, empresa);
    return empresa;
  }

  async consultarEmpresa(cnpj: string): Promise<EmpresaEmissora | null> {
    const limpo = digitos(cnpj);
    const id = await this.idDaEmpresa(limpo);
    if (!id) return null;
    const empresa = empresaDaResposta(
      await this.gestao('GET', `/v2/empresas/${encodeURIComponent(id)}`, 'consultar empresa'),
    );
    this.lembrarToken(limpo, empresa);
    return empresa;
  }

  async emitirNfse(referencia: string, nota: NotaFiscalServico): Promise<SituacaoNfse> {
    const resposta = await this.nfse(
      nota.prestador.cnpj,
      'POST',
      `/v2/nfsen?ref=${encodeURIComponent(referencia)}`,
      'emitir NFS-e',
      payloadNfse(nota),
    );
    return this.situacao(resposta, referencia);
  }

  async consultarNfse(cnpjPrestador: string, referencia: string): Promise<SituacaoNfse | null> {
    try {
      const resposta = await this.nfse(
        cnpjPrestador,
        'GET',
        `/v2/nfsen/${encodeURIComponent(referencia)}`,
        'consultar NFS-e',
      );
      return this.situacao(resposta, referencia);
    } catch (erro) {
      if (erro instanceof ErroEmissorNfse && erro.tipo === 'nao_encontrado') return null;
      throw erro;
    }
  }

  async cancelarNfse(
    cnpjPrestador: string,
    referencia: string,
    justificativa: string,
  ): Promise<SituacaoNfse> {
    const motivo = justificativaCancelamento(justificativa);
    const resposta = await this.nfse(
      cnpjPrestador,
      'DELETE',
      `/v2/nfsen/${encodeURIComponent(referencia)}`,
      'cancelar NFS-e',
      { justificativa: motivo },
    );
    return this.situacao(resposta, referencia);
  }

  private situacao(resposta: unknown, referencia: string): SituacaoNfse {
    const situacao = situacaoDaResposta(resposta, HOST[this.o.ambiente]);
    return { ...situacao, referencia: situacao.referencia || referencia };
  }

  /**
   * Id da empresa na Focus pelo CNPJ (`GET /v2/empresas?cnpj=`). A listagem traz até 50 por
   * página, por isso o filtro: sem ele, com mais de 50 empresas a do CNPJ sumia (Vector).
   */
  private async idDaEmpresa(cnpj: string): Promise<string | null> {
    const lista = await this.gestao(
      'GET',
      `/v2/empresas?cnpj=${encodeURIComponent(cnpj)}`,
      'listar empresas',
    );
    if (!Array.isArray(lista)) {
      throw new ErroEmissorNfse(
        'resposta_inesperada',
        'Resposta inesperada da Focus NFe: a lista de empresas não veio como lista.',
      );
    }
    const achada = lista.find(
      (e: { cnpj?: unknown }) => typeof e?.cnpj === 'string' && digitos(e.cnpj) === cnpj,
    ) as { id?: unknown } | undefined;
    return achada?.id === undefined || achada.id === null ? null : String(achada.id);
  }

  private lembrarToken(cnpj: string, empresa: EmpresaEmissora): void {
    const token = empresa.tokens[this.o.ambiente];
    if (token) this.tokensEmpresa.set(cnpj, token.revelar());
  }

  private async tokenDaEmpresa(cnpj: string): Promise<string> {
    const guardado = this.tokensEmpresa.get(cnpj);
    if (guardado) return guardado;
    const empresa = await this.consultarEmpresa(cnpj);
    if (!empresa) {
      throw new ErroEmissorNfse(
        'nao_encontrado',
        'O CNPJ do prestador não está cadastrado na Focus NFe. Cadastre a empresa antes de emitir.',
        404,
      );
    }
    const token = empresa.tokens[this.o.ambiente]?.revelar();
    if (token) return token;
    this.logger.warn(
      `empresa ${empresa.id} sem token de ${this.o.ambiente}; usando o token mestre`,
    );
    return this.o.tokenMestre;
  }

  private async nfse(
    cnpjPrestador: string,
    metodo: Metodo,
    caminho: string,
    operacao: string,
    corpo?: unknown,
  ): Promise<unknown> {
    const cnpj = digitos(cnpjPrestador);
    const token = await this.tokenDaEmpresa(cnpj);
    try {
      return await this.chamar(HOST[this.o.ambiente], token, metodo, caminho, operacao, corpo);
    } catch (erro) {
      // Token trocado ou revogado na Focus: esquece e busca de novo na próxima chamada.
      if (erro instanceof ErroEmissorNfse && erro.tipo === 'credencial') {
        this.tokensEmpresa.delete(cnpj);
      }
      throw erro;
    }
  }

  private gestao(metodo: Metodo, caminho: string, operacao: string, corpo?: unknown) {
    return this.chamar(HOST.producao, this.o.tokenMestre, metodo, caminho, operacao, corpo);
  }

  private async chamar(
    host: string,
    token: string,
    metodo: Metodo,
    caminho: string,
    operacao: string,
    corpo?: unknown,
  ): Promise<unknown> {
    let resposta: Response;
    try {
      resposta = await this.fetch(`${host}${caminho}`, {
        method: metodo,
        headers: {
          Authorization: `Basic ${Buffer.from(`${token}:`).toString('base64')}`,
          Accept: 'application/json',
          ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(corpo === undefined ? {} : { body: JSON.stringify(corpo) }),
        signal: AbortSignal.timeout(this.o.timeoutMs),
      });
    } catch (erro) {
      const tempo = erro instanceof Error && erro.name === 'TimeoutError';
      this.logger.warn(`${operacao}: ${tempo ? 'tempo esgotado' : 'sem resposta'}`);
      throw new ErroEmissorNfse(
        'indisponivel',
        tempo
          ? 'A Focus NFe não respondeu no prazo. Tente de novo em instantes.'
          : 'Não foi possível falar com a Focus NFe. Tente de novo em instantes.',
      );
    }

    const texto = await resposta.text();
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }

    if (!resposta.ok) {
      const erro = erroDaResposta(resposta.status, json);
      const codigos = erro.erros.map((e) => e.codigo).filter(Boolean);
      this.logger.warn(
        `${operacao}: HTTP ${resposta.status} (${erro.tipo}${codigos.length ? `: ${codigos.join(', ')}` : ''})`,
      );
      throw erro;
    }
    if (json === null) {
      this.logger.warn(`${operacao}: HTTP ${resposta.status} com corpo que não é JSON`);
      throw new ErroEmissorNfse(
        'resposta_inesperada',
        'Resposta inesperada da Focus NFe: o corpo não veio em JSON.',
        resposta.status,
      );
    }
    this.logger.log(`${operacao}: HTTP ${resposta.status}`);
    return json;
  }
}
