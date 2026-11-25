import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import {
  DocumentoInvalidoError,
  ItemNaoEncontradoError,
} from '../../catalogo/comum/catalogo.errors';
import { FixedClock } from '../../identidade/testing/fakes';
import { InMemoryMedicosRepository, InMemoryPagamentoMedicoRepository } from '../testing/fakes';
import { ChavePixIncompletaError } from './pagamento-medico.errors';
import type { DadosPagamento } from './pagamento-medico.repository';
import { PagamentoMedicoService } from './pagamento-medico.service';

const AGORA = new Date('2026-11-14T12:00:00Z');
const ator = { usuarioId: 'u-ana' };

const VAZIO: DadosPagamento = {
  cpf: null,
  cnpj: null,
  razaoSocial: null,
  tipoChavePix: null,
  chavePix: null,
  socio: null,
  optanteSimples: null,
};

describe('PagamentoMedicoService', () => {
  let medicos: InMemoryMedicosRepository;
  let repo: InMemoryPagamentoMedicoRepository;
  let auditoria: InMemoryAuditoria;
  let service: PagamentoMedicoService;
  let medicoId: string;

  beforeEach(async () => {
    medicos = new InMemoryMedicosRepository();
    repo = new InMemoryPagamentoMedicoRepository();
    auditoria = new InMemoryAuditoria();
    service = new PagamentoMedicoService(medicos, repo, auditoria, new FixedClock(AGORA));
    medicoId = await medicos.criar({
      nome: 'Augusto Lima',
      chaveNormalizada: 'augusto lima',
      crm: null,
      idMobilemed: null,
      email: null,
      telefone: null,
      ativo: true,
      ocultoDashboards: false,
      senior: false,
      fellowship: false,
      funcao: null,
      nivelId: null,
      dataInicioVinculo: null,
      observacoes: null,
    });
  });

  it('sem dados ainda, devolve tudo vazio, e toda leitura vai para a auditoria', async () => {
    expect(await service.obter(ator, medicoId)).toEqual(VAZIO);
    expect(auditoria.eventos).toEqual([
      expect.objectContaining({
        ator: { tipo: 'usuario', id: 'u-ana' },
        entidade: 'medico',
        entidadeId: medicoId,
        acao: 'pagamento_lido',
        em: AGORA,
      }),
    ]);
  });

  it('salva com documentos só em dígitos e textos aparados', async () => {
    await service.salvar(ator, medicoId, {
      ...VAZIO,
      cpf: '123.456.789-01',
      cnpj: '12.345.678/0001-90',
      razaoSocial: '  Lima Radiologia ME ',
      tipoChavePix: 'EMAIL',
      chavePix: ' augusto@pix.com ',
      socio: true,
      optanteSimples: false,
    });

    expect(repo.dados.get(medicoId)).toEqual({
      cpf: '12345678901',
      cnpj: '12345678000190',
      razaoSocial: 'Lima Radiologia ME',
      tipoChavePix: 'EMAIL',
      chavePix: 'augusto@pix.com',
      socio: true,
      optanteSimples: false,
    });
  });

  it('confere o tamanho do CPF e do CNPJ', async () => {
    await expect(service.salvar(ator, medicoId, { ...VAZIO, cpf: '123' })).rejects.toThrow(
      DocumentoInvalidoError,
    );
    await expect(service.salvar(ator, medicoId, { ...VAZIO, cnpj: '123' })).rejects.toThrow(
      'O CNPJ tem 14 dígitos.',
    );
  });

  it('exige o tipo junto com a chave Pix, e a chave junto com o tipo', async () => {
    await expect(service.salvar(ator, medicoId, { ...VAZIO, chavePix: 'abc' })).rejects.toThrow(
      ChavePixIncompletaError,
    );
    await expect(service.salvar(ator, medicoId, { ...VAZIO, tipoChavePix: 'CPF' })).rejects.toThrow(
      'Informe a chave Pix junto com o tipo dela.',
    );
  });

  it('audita só o que mudou, com CPF e chave Pix mascarados', async () => {
    await service.salvar(ator, medicoId, { ...VAZIO, cpf: '12345678901', socio: false });

    await service.salvar(ator, medicoId, {
      ...VAZIO,
      cpf: '98765432101',
      socio: false,
      tipoChavePix: 'TELEFONE',
      chavePix: '11988887777',
    });

    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'pagamento_alterado',
      antes: { cpf: '***01', tipoChavePix: null, chavePix: null },
      depois: { cpf: '***01', tipoChavePix: 'TELEFONE', chavePix: '***77' },
    });
    expect(auditoria.eventos.at(-1)?.depois).not.toHaveProperty('socio');
  });

  it('não audita quando nada mudou', async () => {
    await service.salvar(ator, medicoId, { ...VAZIO, socio: true });
    const antes = auditoria.eventos.length;

    await service.salvar(ator, medicoId, { ...VAZIO, socio: true });

    expect(auditoria.eventos).toHaveLength(antes);
  });

  it('avisa quando o médico não existe', async () => {
    await expect(service.obter(ator, 'nao-existe')).rejects.toThrow(ItemNaoEncontradoError);
    await expect(service.salvar(ator, 'nao-existe', VAZIO)).rejects.toThrow(ItemNaoEncontradoError);
  });
});
