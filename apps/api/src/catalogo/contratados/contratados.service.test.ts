import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { FixedClock } from '../../identidade/testing/fakes';
import { ItemEmUsoError, NomeEmUsoError } from '../comum/catalogo.errors';
import { InMemoryContratadosRepository } from '../testing/fakes';
import {
  CnpjEmUsoError,
  DocumentoInvalidoError,
  FinanceiroInativoError,
  PadraoInativoError,
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
  padrao: false,
  usaFinanceiro: false,
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

  describe('contratado padrão (o que vem escolhido nos campos de contratado)', () => {
    it('marcar um desmarca o anterior e audita os dois', async () => {
      const tele = await service.criar(ator, dados('TELE', { padrao: true }));
      const rn = await service.criar(ator, dados('RN'));
      auditoria.eventos.length = 0;

      await service.atualizar(ator, rn, dados('RN', { padrao: true }));

      expect((await service.obter(rn)).padrao).toBe(true);
      expect((await service.obter(tele)).padrao).toBe(false);
      expect(auditoria.eventos).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            entidadeId: rn,
            acao: 'alterado',
            antes: { padrao: false },
            depois: { padrao: true },
          }),
          expect.objectContaining({
            entidadeId: tele,
            acao: 'alterado',
            antes: { padrao: true },
            depois: { padrao: false },
          }),
        ]),
      );
      expect(auditoria.eventos).toHaveLength(2);
    });

    it('criar já como padrão desmarca o anterior', async () => {
      const tele = await service.criar(ator, dados('TELE', { padrao: true }));
      const rn = await service.criar(ator, dados('RN', { padrao: true }));

      expect((await service.obter(rn)).padrao).toBe(true);
      expect((await service.obter(tele)).padrao).toBe(false);
      expect(auditoria.eventos.at(-1)).toMatchObject({
        entidadeId: tele,
        acao: 'alterado',
        depois: { padrao: false },
      });
    });

    it('salvar o próprio padrão de novo não gera evento de desmarcar', async () => {
      const tele = await service.criar(ator, dados('TELE', { padrao: true }));
      auditoria.eventos.length = 0;

      await service.atualizar(ator, tele, dados('TELE', { padrao: true, cidade: 'SP' }));

      expect(auditoria.eventos).toHaveLength(1);
      expect((await service.obter(tele)).padrao).toBe(true);
    });

    it('contratado inativo não pode ser o padrão', async () => {
      await expect(
        service.criar(ator, dados('TELE', { padrao: true, ativo: false })),
      ).rejects.toThrow(PadraoInativoError);
      const tele = await service.criar(ator, dados('TELE', { padrao: true }));
      await expect(
        service.atualizar(ator, tele, dados('TELE', { padrao: true, ativo: false })),
      ).rejects.toThrow('Um contratado inativo não pode ser o contratado padrão.');
    });
  });

  describe('usa o financeiro do One', () => {
    it('liga e desliga com auditoria do campo', async () => {
      const tele = await service.criar(ator, dados('TELE', { usaFinanceiro: true }));
      expect((await service.obter(tele)).usaFinanceiro).toBe(true);
      expect(auditoria.eventos.at(-1)).toMatchObject({
        entidadeId: tele,
        acao: 'criado',
        depois: expect.objectContaining({ usaFinanceiro: true }),
      });
      auditoria.eventos.length = 0;

      await service.atualizar(ator, tele, dados('TELE', { usaFinanceiro: false }));

      expect((await service.obter(tele)).usaFinanceiro).toBe(false);
      expect(auditoria.eventos).toEqual([
        expect.objectContaining({
          entidadeId: tele,
          acao: 'alterado',
          antes: { usaFinanceiro: true },
          depois: { usaFinanceiro: false },
        }),
      ]);
    });

    it('mais de um contratado pode usar', async () => {
      const tele = await service.criar(ator, dados('TELE', { usaFinanceiro: true }));
      const rn = await service.criar(ator, dados('RN', { usaFinanceiro: true }));

      expect((await service.obter(tele)).usaFinanceiro).toBe(true);
      expect((await service.obter(rn)).usaFinanceiro).toBe(true);
    });

    it('contratado inativo não pode usar', async () => {
      await expect(
        service.criar(ator, dados('TELE', { usaFinanceiro: true, ativo: false })),
      ).rejects.toThrow(FinanceiroInativoError);
      const tele = await service.criar(ator, dados('TELE', { usaFinanceiro: true }));
      await expect(
        service.atualizar(ator, tele, dados('TELE', { usaFinanceiro: true, ativo: false })),
      ).rejects.toThrow('Um contratado inativo não pode usar o financeiro do One.');
    });
  });

  it('não exclui contratado em uso', async () => {
    const id = await service.criar(ator, dados('A'));
    repo.emUso.add(id);

    await expect(service.excluir(ator, id)).rejects.toThrow(ItemEmUsoError);
  });
});
