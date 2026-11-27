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
import { Segredo } from '../../domain/segredo';

const digitos = (texto: string) => texto.replace(/\D/g, '');

/**
 * Emissor de NFS-e em memória, para desenvolvimento e testes (`FOCUS_NFE_INTEGRACAO=simulador`,
 * o padrão sem `FOCUS_NFE_TOKEN`). Segue o fluxo da Focus: a empresa é uma por CNPJ; a nota entra
 * como `processando` e sai `autorizada` na primeira consulta, com número sequencial por
 * prestador; referência repetida é recusada; só nota autorizada é cancelada. Nada sai do
 * processo, e tudo some ao reiniciar.
 */
export class SimuladorEmissorNfse implements EmissorNfse {
  private readonly empresas = new Map<string, EmpresaEmissora>();
  private readonly notas = new Map<string, SituacaoNfse>();
  private readonly ultimoNumero = new Map<string, number>();
  private proximoId = 1;

  constructor(
    private readonly ambiente: AmbienteNfse,
    private readonly agora: () => Date = () => new Date(),
  ) {}

  async salvarEmpresa(dados: DadosEmpresaEmissora): Promise<EmpresaEmissora> {
    const cnpj = digitos(dados.cnpj);
    const anterior = this.empresas.get(cnpj);
    const id = anterior?.id ?? String(this.proximoId++);
    const validoDe = this.agora();
    const validoAte = new Date(validoDe);
    validoAte.setUTCFullYear(validoAte.getUTCFullYear() + 1);
    const empresa: EmpresaEmissora = {
      id,
      cnpj,
      razaoSocial: dados.razaoSocial,
      certificado: dados.certificado
        ? { cnpjTitular: cnpj, validoDe, validoAte }
        : (anterior?.certificado ?? null),
      habilitada: {
        producao: this.ambiente === 'producao' || (anterior?.habilitada.producao ?? false),
        homologacao: this.ambiente === 'homologacao' || (anterior?.habilitada.homologacao ?? false),
      },
      tokens: {
        producao: new Segredo(`simulador-producao-${id}`),
        homologacao: new Segredo(`simulador-homologacao-${id}`),
      },
    };
    this.empresas.set(cnpj, empresa);
    return empresa;
  }

  async consultarEmpresa(cnpj: string): Promise<EmpresaEmissora | null> {
    return this.empresas.get(digitos(cnpj)) ?? null;
  }

  async emitirNfse(referencia: string, nota: NotaFiscalServico): Promise<SituacaoNfse> {
    const cnpj = digitos(nota.prestador.cnpj);
    if (!this.empresas.has(cnpj)) {
      throw new ErroEmissorNfse(
        'nao_encontrado',
        'O CNPJ do prestador não está cadastrado no emissor (simulador). Cadastre a empresa antes.',
        404,
      );
    }
    const chave = `${cnpj}:${referencia}`;
    if (this.notas.has(chave)) {
      throw new ErroEmissorNfse(
        'recusada',
        'A Focus NFe recusou: referência já usada (simulador).',
        422,
        [
          {
            codigo: 'referencia_duplicada',
            mensagem: 'Referência já usada',
            correcao: null,
            campo: null,
          },
        ],
      );
    }
    const situacao: SituacaoNfse = {
      referencia,
      status: 'processando',
      numero: null,
      codigoVerificacao: null,
      dataEmissao: null,
      protocolo: `simulador-${referencia}`,
      urlNota: null,
      urlDanfse: null,
      urlXml: null,
      urlXmlCancelamento: null,
      erros: [],
    };
    this.notas.set(chave, situacao);
    return { ...situacao };
  }

  async consultarNfse(cnpjPrestador: string, referencia: string): Promise<SituacaoNfse | null> {
    const cnpj = digitos(cnpjPrestador);
    const chave = `${cnpj}:${referencia}`;
    const atual = this.notas.get(chave);
    if (!atual) return null;
    if (atual.status === 'processando') {
      const numero = (this.ultimoNumero.get(cnpj) ?? 0) + 1;
      this.ultimoNumero.set(cnpj, numero);
      const base = `https://simulador.local/nfse/${cnpj}/${numero}`;
      this.notas.set(chave, {
        ...atual,
        status: 'autorizada',
        numero: String(numero),
        codigoVerificacao: `SIM${String(numero).padStart(6, '0')}`,
        dataEmissao: this.agora(),
        urlNota: base,
        urlDanfse: `${base}/danfse.pdf`,
        urlXml: `${base}/nfse.xml`,
      });
    }
    return { ...(this.notas.get(chave) as SituacaoNfse) };
  }

  async cancelarNfse(
    cnpjPrestador: string,
    referencia: string,
    justificativa: string,
  ): Promise<SituacaoNfse> {
    justificativaCancelamento(justificativa);
    const chave = `${digitos(cnpjPrestador)}:${referencia}`;
    const atual = this.notas.get(chave);
    if (!atual) {
      throw new ErroEmissorNfse('nao_encontrado', 'Nota não encontrada (simulador).', 404);
    }
    if (atual.status !== 'autorizada') {
      throw new ErroEmissorNfse(
        'recusada',
        'A Focus NFe recusou: só nota autorizada pode ser cancelada (simulador).',
        422,
      );
    }
    const cancelada: SituacaoNfse = {
      ...atual,
      status: 'cancelada',
      urlXmlCancelamento: `${atual.urlXml?.replace(/nfse\.xml$/, '')}cancelamento.xml`,
    };
    this.notas.set(chave, cancelada);
    return { ...cancelada };
  }
}
