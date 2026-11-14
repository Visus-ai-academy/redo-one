import { Inject, Injectable } from '@nestjs/common';

import { AUDITORIA, type Auditoria } from '../../auditoria/auditoria';
import { ItemNaoEncontradoError } from '../../catalogo/comum/catalogo.errors';
import { documentoOpcional, textoOpcional } from '../../catalogo/comum/documentos';
import { type AtorCatalogo, RegistroAuditoria } from '../../catalogo/comum/registro-auditoria';
import { CLOCK, type Clock } from '../../identidade/clock';
import { MEDICOS_REPOSITORY, type MedicosRepository } from '../cadastro/medicos.repository';
import { ROTULO_MEDICO } from '../cadastro/medicos.service';
import { ChavePixIncompletaError } from './pagamento-medico.errors';
import {
  type DadosPagamento,
  PAGAMENTO_MEDICO_REPOSITORY,
  type PagamentoMedicoRepository,
} from './pagamento-medico.repository';

const VAZIO: DadosPagamento = {
  cpf: null,
  cnpj: null,
  razaoSocial: null,
  tipoChavePix: null,
  chavePix: null,
  socio: null,
  optanteSimples: null,
  omieCodigoFornecedor: null,
};

/** Na auditoria, CPF e chave Pix aparecem só pelos dois últimos caracteres. */
const mascarar = (valor: unknown) => (typeof valor === 'string' ? `***${valor.slice(-2)}` : valor);
const SENSIVEIS = new Set<keyof DadosPagamento>(['cpf', 'chavePix']);

/**
 * Dados de pagamento do médico (LGPD: pessoal), à parte do cadastro e com permissão própria.
 * Toda leitura e toda alteração vão para a auditoria do médico.
 */
@Injectable()
export class PagamentoMedicoService {
  private readonly registro: RegistroAuditoria;

  constructor(
    @Inject(MEDICOS_REPOSITORY) private readonly medicos: Pick<MedicosRepository, 'buscar'>,
    @Inject(PAGAMENTO_MEDICO_REPOSITORY) private readonly repo: PagamentoMedicoRepository,
    @Inject(AUDITORIA) auditoria: Auditoria,
    @Inject(CLOCK) clock: Clock,
  ) {
    this.registro = new RegistroAuditoria(ROTULO_MEDICO, auditoria, clock);
  }

  async obter(ator: AtorCatalogo, medicoId: string): Promise<DadosPagamento> {
    await this.garantirMedico(medicoId);
    const dados = (await this.repo.buscar(medicoId)) ?? VAZIO;
    await this.registro.registrar(ator, medicoId, 'pagamento_lido');
    return dados;
  }

  async salvar(ator: AtorCatalogo, medicoId: string, dados: DadosPagamento): Promise<void> {
    await this.garantirMedico(medicoId);
    const validos = validar(dados);
    const atual = (await this.repo.buscar(medicoId)) ?? VAZIO;
    await this.repo.salvar(medicoId, validos);

    const mudou = (Object.keys(validos) as (keyof DadosPagamento)[]).filter(
      (campo) => atual[campo] !== validos[campo],
    );
    if (!mudou.length) return;
    const recorte = (campos: DadosPagamento) =>
      Object.fromEntries(mudou.map((c) => [c, SENSIVEIS.has(c) ? mascarar(campos[c]) : campos[c]]));
    await this.registro.registrar(
      ator,
      medicoId,
      'pagamento_alterado',
      recorte(atual),
      recorte(validos),
    );
  }

  private async garantirMedico(medicoId: string) {
    if (!(await this.medicos.buscar(medicoId))) throw new ItemNaoEncontradoError(ROTULO_MEDICO);
  }
}

function validar(dados: DadosPagamento): DadosPagamento {
  const chavePix = textoOpcional(dados.chavePix);
  if (chavePix && !dados.tipoChavePix) {
    throw new ChavePixIncompletaError('Informe o tipo da chave Pix.');
  }
  if (dados.tipoChavePix && !chavePix) {
    throw new ChavePixIncompletaError('Informe a chave Pix junto com o tipo dela.');
  }
  return {
    cpf: documentoOpcional(dados.cpf, 11, 'O CPF tem 11 dígitos.'),
    cnpj: documentoOpcional(dados.cnpj, 14, 'O CNPJ tem 14 dígitos.'),
    razaoSocial: textoOpcional(dados.razaoSocial),
    tipoChavePix: dados.tipoChavePix,
    chavePix,
    socio: dados.socio,
    optanteSimples: dados.optanteSimples,
    omieCodigoFornecedor: textoOpcional(dados.omieCodigoFornecedor),
  };
}
