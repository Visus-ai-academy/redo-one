import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { FixedClock } from '../../identidade/testing/fakes';
import { ItemEmUsoError, NomeEmUsoError } from '../comum/catalogo.errors';
import { InMemoryContratadosRepository } from '../testing/fakes';
import {
  CnpjEmUsoError,
  DocumentoInvalidoError,
  RepasseEmCadeiaError,
  RepasseInvalidoError,
} from './contratados.errors';
import type { DadosContratado } from './contratados.repository';
import { ContratadosService } from './contratados.service';

const ator = { usuarioId: 'u-ana' };
const dados = (razaoSocial: string, extra: Partial<DadosContratado> = {}): DadosContratado => ({
  razaoSocial,
  cnpj: null,
  endereco: null,
  cidade: null,
  uf: null,
  cep: null,
  contratadoRepasseId: null,
  ativo: true,
  ...extra,
});

describe('ContratadosService', () => {
  let repo: InMemoryContratadosRepository;
  let auditoria: InMemoryAuditoria;
  let service: ContratadosService;

  beforeEach(() => {
    repo = new InMemoryContratadosRepository();
    auditoria = new InMemoryAuditoria();
    service = new ContratadosService(
      repo,
      auditoria,
      new FixedClock(new Date('2026-11-14T12:00:00Z')),
    );
  });

  it('guarda CNPJ e CEP só com dígitos e a UF em maiúsculas, e audita', async () => {
    const id = await service.criar(
      ator,
      dados(' 001 TELEIMAGEM LTDA ', { cnpj: '12.345.678/0001-90', cep: '01310-100', uf: 'sp' }),
    );

    expect(await service.obter(id)).toMatchObject({
      razaoSocial: '001 TELEIMAGEM LTDA',
      cnpj: '12345678000190',
      cep: '01310100',
      uf: 'SP',
    });
    expect(auditoria.eventos[0]).toMatchObject({ entidade: 'contratado', acao: 'criado' });
  });

  it('recusa razão social ou CNPJ repetidos', async () => {
    await service.criar(ator, dados('TELEIMAGEM', { cnpj: '12345678000190' }));

    await expect(service.criar(ator, dados('teleimagem'))).rejects.toThrow(NomeEmUsoError);
    await expect(
      service.criar(ator, dados('OUTRA', { cnpj: '12.345.678/0001-90' })),
    ).rejects.toThrow(CnpjEmUsoError);
  });

  it('recusa CNPJ, CEP ou UF com tamanho errado', async () => {
    await expect(service.criar(ator, dados('A', { cnpj: '123' }))).rejects.toThrow(
      DocumentoInvalidoError,
    );
    await expect(service.criar(ator, dados('A', { cep: '0131' }))).rejects.toThrow(
      DocumentoInvalidoError,
    );
    await expect(service.criar(ator, dados('A', { uf: 'SPX' }))).rejects.toThrow(
      DocumentoInvalidoError,
    );
  });

  describe('contratado de repasse (consolidação em um passo só)', () => {
    it('não consolida nele mesmo', async () => {
      const id = await service.criar(ator, dados('A'));

      await expect(
        service.atualizar(ator, id, dados('A', { contratadoRepasseId: id })),
      ).rejects.toThrow(RepasseInvalidoError);
    });

    it('não aponta para quem já consolida em outro', async () => {
      const c = await service.criar(ator, dados('C'));
      const b = await service.criar(ator, dados('B', { contratadoRepasseId: c }));

      await expect(service.criar(ator, dados('A', { contratadoRepasseId: b }))).rejects.toThrow(
        'B já consolida em outro contratado: aponte direto para o consolidador final.',
      );
    });

    it('quem recebe consolidação não passa a consolidar em outro', async () => {
      const b = await service.criar(ator, dados('B'));
      await service.criar(ator, dados('A', { contratadoRepasseId: b }));
      const c = await service.criar(ator, dados('C'));

      await expect(
        service.atualizar(ator, b, dados('B', { contratadoRepasseId: c })),
      ).rejects.toThrow(RepasseEmCadeiaError);
      await expect(
        service.atualizar(ator, b, dados('B', { contratadoRepasseId: c })),
      ).rejects.toThrow('A consolida em B: B não pode consolidar em outro contratado.');
    });

    it('recusa contratado de repasse inexistente', async () => {
      await expect(
        service.criar(ator, dados('A', { contratadoRepasseId: 'nao-existe' })),
      ).rejects.toThrow(RepasseInvalidoError);
    });
  });

  it('não exclui contratado em uso', async () => {
    const id = await service.criar(ator, dados('A'));
    repo.emUso.add(id);

    await expect(service.excluir(ator, id)).rejects.toThrow(ItemEmUsoError);
  });
});
