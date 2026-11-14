import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../auditoria/testing';
import { FixedClock } from '../../identidade/testing/fakes';
import { ItemNaoEncontradoError } from '../comum/catalogo.errors';
import { InMemoryDeParaRepository } from '../testing/fakes';
import { DeParaInvalidoError, DeParaRepetidoError } from './de-para.errors';
import type {
  DadosDeParaEspecialidade,
  DadosDeParaPrioridade,
  DadosDeParaValor,
  DadosSufixo,
} from './de-para.repository';
import { DeParaService } from './de-para.service';
import { REGRA_ESPECIALIDADE, REGRA_PRIORIDADE, REGRA_SUFIXO, REGRA_VALOR_EXAME } from './regras';

const ator = { usuarioId: 'u-ana' };
const clock = new FixedClock(new Date('2026-11-14T12:00:00Z'));

describe('DeParaService', () => {
  describe('prioridade', () => {
    let repo: InMemoryDeParaRepository<DadosDeParaPrioridade>;
    let auditoria: InMemoryAuditoria;
    let service: DeParaService<DadosDeParaPrioridade>;

    beforeEach(() => {
      repo = new InMemoryDeParaRepository(REGRA_PRIORIDADE.chave);
      auditoria = new InMemoryAuditoria();
      service = new DeParaService(REGRA_PRIORIDADE, repo, auditoria, clock);
    });

    it('cria com a origem aparada, audita e recusa origem repetida', async () => {
      const id = await service.criar(ator, {
        origem: ' ROTINA ',
        prioridadeId: 'p-1',
        ativo: true,
      });

      expect(await service.obter(id)).toMatchObject({ origem: 'ROTINA' });
      expect(auditoria.eventos[0]).toMatchObject({
        entidade: 'de_para_prioridade',
        acao: 'criado',
      });
      await expect(
        service.criar(ator, { origem: 'ROTINA', prioridadeId: 'p-2', ativo: true }),
      ).rejects.toThrow('Já existe um de-para para "ROTINA".');
    });

    it('edita mantendo a própria origem, audita a mudança e exclui', async () => {
      const id = await service.criar(ator, { origem: 'ROTINA', prioridadeId: 'p-1', ativo: true });

      await service.atualizar(ator, id, { origem: 'ROTINA', prioridadeId: 'p-2', ativo: true });
      expect(auditoria.eventos.at(-1)).toMatchObject({
        acao: 'alterado',
        antes: { prioridadeId: 'p-1' },
        depois: { prioridadeId: 'p-2' },
      });

      await service.excluir(ator, id);
      await expect(service.obter(id)).rejects.toThrow(ItemNaoEncontradoError);
    });
  });

  describe('especialidade', () => {
    let service: DeParaService<DadosDeParaEspecialidade>;
    const neuro = { id: 'e-neuro', nome: 'NEURO' };

    beforeEach(() => {
      const regra = REGRA_ESPECIALIDADE({ buscar: async (id) => (id === neuro.id ? neuro : null) });
      service = new DeParaService(
        regra,
        new InMemoryDeParaRepository(regra.chave),
        new InMemoryAuditoria(),
        clock,
      );
    });

    const dados = (extra: Partial<DadosDeParaEspecialidade>): DadosDeParaEspecialidade => ({
      tipo: 'normalizacao',
      origem: 'cabeça-pescoço',
      especialidadeId: neuro.id,
      ativo: true,
      observacoes: null,
      ...extra,
    });

    it('guarda a origem em maiúsculas; na região anatômica, também sem acento', async () => {
      const a = await service.criar(ator, dados({}));
      const b = await service.criar(ator, dados({ tipo: 'regiao_anatomica', origem: 'crânio' }));

      expect((await service.obter(a)).origem).toBe('CABEÇA-PESCOÇO');
      expect((await service.obter(b)).origem).toBe('CRANIO');
    });

    it('a mesma origem pode estar em tipos diferentes, mas não repetida no mesmo tipo', async () => {
      await service.criar(ator, dados({ origem: 'RX', tipo: 'invalida', especialidadeId: null }));
      await service.criar(ator, dados({ origem: 'RX' }));

      await expect(service.criar(ator, dados({ origem: 'rx' }))).rejects.toThrow(
        DeParaRepetidoError,
      );
    });

    it('exige destino, menos no tipo inválida (que não tem destino)', async () => {
      await expect(service.criar(ator, dados({ especialidadeId: null }))).rejects.toThrow(
        'Informe a especialidade de destino.',
      );
      const id = await service.criar(
        ator,
        dados({ tipo: 'invalida', origem: 'CT', especialidadeId: neuro.id }),
      );
      expect((await service.obter(id)).especialidadeId).toBeNull();
    });

    it('recusa origem igual ao destino: a regra não faria nada', async () => {
      await expect(service.criar(ator, dados({ origem: 'neuro' }))).rejects.toThrow(
        DeParaInvalidoError,
      );
    });

    it('recusa especialidade inexistente', async () => {
      await expect(service.criar(ator, dados({ especialidadeId: 'nao-existe' }))).rejects.toThrow(
        'Especialidade não encontrada.',
      );
    });
  });

  describe('valores do exame', () => {
    let repo: InMemoryDeParaRepository<DadosDeParaValor>;
    let service: DeParaService<DadosDeParaValor>;

    beforeEach(() => {
      repo = new InMemoryDeParaRepository(REGRA_VALOR_EXAME.chave);
      service = new DeParaService(REGRA_VALOR_EXAME, repo, new InMemoryAuditoria(), clock);
    });

    it('a chave é a descrição do estudo normalizada; grafias equivalentes conflitam', async () => {
      await service.criar(ator, {
        estudoDescricao: 'RM CRÂNIO',
        valores: 2,
        exameId: null,
        ativo: true,
      });

      await expect(
        service.criar(ator, {
          estudoDescricao: 'rm  cranio',
          valores: 3,
          exameId: null,
          ativo: true,
        }),
      ).rejects.toThrow('Já existe um de-para para "rm  cranio".');
    });
  });

  describe('sufixo do nome do cliente', () => {
    it('recusa sufixo repetido sem diferenciar maiúsculas', async () => {
      const service = new DeParaService<DadosSufixo>(
        REGRA_SUFIXO,
        new InMemoryDeParaRepository(REGRA_SUFIXO.chave),
        new InMemoryAuditoria(),
        clock,
      );
      await service.criar(ator, { sufixo: '_PLANTÃO', ativo: true, observacoes: null });

      await expect(
        service.criar(ator, { sufixo: '_plantão', ativo: true, observacoes: null }),
      ).rejects.toThrow(DeParaRepetidoError);
    });
  });
});
