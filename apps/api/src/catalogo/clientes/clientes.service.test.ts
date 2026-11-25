import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { FixedClock } from '../../identidade/testing/fakes';
import { DocumentoInvalidoError, ItemEmUsoError, NomeEmUsoError } from '../comum/catalogo.errors';
import { InMemoryClientesRepository, InMemoryContratadosRepository } from '../testing/fakes';
import { ContratadoObrigatorioError } from './clientes.errors';
import type { DadosCliente } from './clientes.repository';
import { ClientesService } from './clientes.service';

const ator = { usuarioId: 'u-ana' };

describe('ClientesService', () => {
  let repo: InMemoryClientesRepository;
  let auditoria: InMemoryAuditoria;
  let service: ClientesService;
  let tele: string;

  const dados = (nome: string, extra: Partial<DadosCliente> = {}): DadosCliente => ({
    nome,
    nomeFantasia: null,
    razaoSocial: null,
    tipoPessoa: 'PJ',
    cnpj: null,
    cpf: null,
    contratadoId: tele,
    ativo: true,
    ocultoDashboards: false,
    observacoes: null,
    ...extra,
  });

  beforeEach(async () => {
    const contratados = new InMemoryContratadosRepository();
    tele = await contratados.criar({
      razaoSocial: '001 TELEIMAGEM',
      cnpj: null,
      endereco: null,
      cidade: null,
      uf: null,
      cep: null,
      contratadoRepasseId: null,
      ativo: true,
      padrao: false,
      usaFinanceiro: false,
    });
    repo = new InMemoryClientesRepository(contratados);
    auditoria = new InMemoryAuditoria();
    service = new ClientesService(
      repo,
      contratados,
      auditoria,
      new FixedClock(new Date('2026-11-14T12:00:00Z')),
    );
  });

  it('cria com o nome da MobileMed aparado, documento só com dígitos, e audita', async () => {
    const id = await service.criar(ator, dados(' CEDIDIAG ', { cnpj: '12.345.678/0001-90' }));

    expect(await service.obter(id)).toMatchObject({
      nome: 'CEDIDIAG',
      cnpj: '12345678000190',
      contratado: { id: tele, razaoSocial: '001 TELEIMAGEM' },
      aliases: [],
    });
    expect(auditoria.eventos[0]).toMatchObject({ entidade: 'cliente', acao: 'criado' });
  });

  it('exige a empresa que fatura, existente', async () => {
    await expect(service.criar(ator, dados('A', { contratadoId: null }))).rejects.toThrow(
      'Informe a empresa que fatura este cliente.',
    );
    await expect(service.criar(ator, dados('A', { contratadoId: 'nao-existe' }))).rejects.toThrow(
      ContratadoObrigatorioError,
    );
  });

  it('recusa nome repetido sem diferenciar maiúsculas', async () => {
    await service.criar(ator, dados('CEDIDIAG'));

    await expect(service.criar(ator, dados('cedidiag'))).rejects.toThrow(NomeEmUsoError);
  });

  it('confere o tamanho do CNPJ e do CPF', async () => {
    await expect(service.criar(ator, dados('A', { cnpj: '123' }))).rejects.toThrow(
      DocumentoInvalidoError,
    );
    await expect(service.criar(ator, dados('A', { tipoPessoa: 'PF', cpf: '123' }))).rejects.toThrow(
      DocumentoInvalidoError,
    );
  });

  it('audita só o que mudou, sem o CPF em claro', async () => {
    const id = await service.criar(ator, dados('A', { tipoPessoa: 'PF', cpf: '123.456.789-09' }));
    expect(auditoria.eventos[0]?.depois).toMatchObject({ cpf: '***09' });

    await service.atualizar(
      ator,
      id,
      dados('A', { tipoPessoa: 'PF', cpf: '98765432100', ocultoDashboards: true }),
    );

    expect(auditoria.eventos.at(-1)).toMatchObject({
      acao: 'alterado',
      antes: { cpf: '***09', ocultoDashboards: false },
      depois: { cpf: '***00', ocultoDashboards: true },
    });
  });

  it('não exclui cliente em uso', async () => {
    const id = await service.criar(ator, dados('A'));
    repo.emUso.add(id);

    await expect(service.excluir(ator, id)).rejects.toThrow(ItemEmUsoError);
  });
});
