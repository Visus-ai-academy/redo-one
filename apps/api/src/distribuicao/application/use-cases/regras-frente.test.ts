import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import type { FrenteEscala } from '../../domain/arranjo';
import { REGRAS_NEUTRAS, type RegrasFrente } from '../../domain/motor/configuracao';
import { ConfiguracaoInvalidaError } from '../../domain/validacao';
import { CadastrosEmMemoria, RegrasFrenteEmMemoria } from '../../testing/fakes';
import { FrenteCatalogoNaoEncontradaError } from '../erros';
import { DefinirRegrasFrente, ListarRegrasFrente, ObterRegrasFrente } from './regras-frente';

const agora = new Date('2026-11-17T18:00:00Z');
const ator = { tipo: 'usuario' as const, id: 'u1' };
const MAMA: FrenteEscala = { tipo: 'especialidade', especialidadeId: 'mama', modalidadeId: null };
const CT: FrenteEscala = { tipo: 'modalidade', especialidadeId: null, modalidadeId: 'ct' };
const { frente: _, ...semFrente } = { frente: MAMA, ...REGRAS_NEUTRAS };
const editadas = (parcial: Partial<RegrasFrente> = {}): Omit<RegrasFrente, 'frente'> => ({
  ...semFrente,
  ...parcial,
});

describe('regras da frente', () => {
  let repo: RegrasFrenteEmMemoria;
  let cadastros: CadastrosEmMemoria;
  let auditoria: InMemoryAuditoria;
  let obter: ObterRegrasFrente;
  let definir: DefinirRegrasFrente;

  beforeEach(() => {
    repo = new RegrasFrenteEmMemoria();
    cadastros = new CadastrosEmMemoria();
    cadastros.existentes.set('especialidade', new Set(['mama']));
    cadastros.existentes.set('modalidade', new Set(['ct', 'mr']));
    cadastros.existentes.set('prioridadeOperacao', new Set(['op-rot']));
    cadastros.existentes.set('turno', new Set(['lista']));
    auditoria = new InMemoryAuditoria();
    obter = new ObterRegrasFrente(repo, cadastros);
    definir = new DefinirRegrasFrente(repo, cadastros, auditoria, () => agora);
  });

  it('frente sem cadastro: as regras neutras, sem sobrescrita de urgência nem de recebimento', async () => {
    expect(await obter.executar(MAMA)).toEqual({
      regras: { frente: MAMA, ...REGRAS_NEUTRAS },
      cadastrada: false,
    });
  });

  it('frente que não existe no catálogo: 404', async () => {
    const outra: FrenteEscala = { tipo: 'especialidade', especialidadeId: 'x', modalidadeId: null };
    await expect(obter.executar(outra)).rejects.toBeInstanceOf(FrenteCatalogoNaoEncontradaError);
    await expect(definir.executar(ator, outra, editadas())).rejects.toBeInstanceOf(
      FrenteCatalogoNaoEncontradaError,
    );
  });

  it('cria, audita com a frente e lê de volta', async () => {
    const segueSla = [
      { prioridadeOperacaoId: 'op-rot', turnoId: 'lista', regra: { tipo: 'segue_sla' as const } },
    ];
    const mama = editadas({ recebimento: segueSla, recolheAoFimDoTurno: false });
    await definir.executar(ator, MAMA, mama);
    expect(await obter.executar(MAMA)).toEqual({
      regras: { frente: MAMA, ...mama },
      cadastrada: true,
    });
    expect(auditoria.eventos).toEqual([
      {
        ator,
        entidade: 'regras_frente',
        entidadeId: 'mama',
        acao: 'criado',
        antes: { recebimento: [], recolheAoFimDoTurno: true },
        depois: { recebimento: segueSla, recolheAoFimDoTurno: false, frente: MAMA },
        em: agora,
      },
    ]);
  });

  it('alteração seguinte audita só o que mudou; sem mudança não grava', async () => {
    await definir.executar(ator, CT, editadas({ tetoPorMedico: 10 }));
    await definir.executar(ator, CT, editadas({ tetoPorMedico: 10 }));
    expect(repo.gravacoes).toBe(1);
    await definir.executar(ator, CT, editadas({ tetoPorMedico: null }));
    expect(auditoria.eventos[1]).toMatchObject({
      acao: 'alterado',
      entidadeId: 'ct',
      antes: { tetoPorMedico: 10 },
      depois: { tetoPorMedico: null, frente: CT },
    });
  });

  it('salvar as regras neutras numa frente sem cadastro não cria nada', async () => {
    await definir.executar(ator, MAMA, editadas());
    expect(repo.gravacoes).toBe(0);
    expect(auditoria.eventos).toEqual([]);
  });

  it('recusa regra inválida e cadastro citado que não existe', async () => {
    await expect(
      definir.executar(
        ator,
        CT,
        editadas({
          divisao: {
            metodo: 'proporcao',
            proporcoes: [
              { modalidadeId: 'mr', percentual: 60 },
              { modalidadeId: 'ct', percentual: 40 },
            ],
          },
        }),
      ),
    ).rejects.toBeInstanceOf(ConfiguracaoInvalidaError);
    await expect(
      definir.executar(
        ator,
        MAMA,
        editadas({
          urgencias: [{ prioridadeOperacaoId: 'sumiu', urgencia: { tipo: 'sempre' } }],
        }),
      ),
    ).rejects.toThrow(/Prioridade da operação não encontrada/);
    await expect(
      definir.executar(
        ator,
        MAMA,
        editadas({
          recebimento: [
            { prioridadeOperacaoId: 'op-rot', turnoId: 'sumiu', regra: { tipo: 'nao_recebe' } },
          ],
        }),
      ),
    ).rejects.toThrow(/Turno não encontrado/);
    expect(repo.gravacoes).toBe(0);
  });

  describe('segmento da especialidade', () => {
    const NEURO: FrenteEscala = {
      tipo: 'especialidade',
      especialidadeId: 'neuro',
      modalidadeId: null,
    };
    const segmento = (subespecialidadeId: string) => ({
      subespecialidadeId,
      teto: 5,
      tetoReduzido: null,
      piso: null,
      pacoteAParte: false,
    });

    beforeEach(() => {
      cadastros.existentes.set('especialidade', new Set(['mama', 'neuro', 'msk']));
      cadastros.segmentosCadastrados.push(
        { id: 's-avc', nome: 'AVC', especialidadeIds: ['neuro'] },
        { id: 's-colunas', nome: 'COLUNAS', especialidadeIds: ['neuro', 'msk'] },
      );
    });

    it('recusa regra de segmento que a especialidade da frente não tem', async () => {
      await expect(
        definir.executar(ator, MAMA, editadas({ segmentos: [segmento('s-avc')] })),
      ).rejects.toThrow(
        new ConfiguracaoInvalidaError(
          'O segmento AVC não existe na especialidade desta frente. Escolha um segmento dela ou deixe sem segmento.',
        ),
      );
      await definir.executar(ator, NEURO, editadas({ segmentos: [segmento('s-colunas')] }));
      expect(repo.gravacoes).toBe(1);
    });

    it('frente de modalidade aceita segmento de qualquer especialidade', async () => {
      await definir.executar(ator, CT, editadas({ segmentos: [segmento('s-avc')] }));
      expect(repo.gravacoes).toBe(1);
    });

    it('recusa fatia da mistura com segmento que a especialidade dela não tem', async () => {
      await expect(
        definir.executar(
          ator,
          NEURO,
          editadas({
            mistura: [
              { todasEspecialidades: false, especialidadeId: 'msk', subespecialidadeId: 's-avc' },
              { todasEspecialidades: false, especialidadeId: 'neuro', subespecialidadeId: null },
            ],
          }),
        ),
      ).rejects.toThrow(/O segmento AVC não existe na especialidade da fatia da mistura/);
      await definir.executar(
        ator,
        NEURO,
        editadas({
          mistura: [
            { todasEspecialidades: false, especialidadeId: 'msk', subespecialidadeId: 's-colunas' },
            { todasEspecialidades: true, especialidadeId: null, subespecialidadeId: 's-avc' },
          ],
        }),
      );
      expect(repo.gravacoes).toBe(1);
    });

    it('não barra o que já estava gravado fora da regra e segue igual', async () => {
      const antigas = editadas({
        segmentos: [segmento('s-avc')],
        mistura: [
          { todasEspecialidades: false, especialidadeId: 'msk', subespecialidadeId: 's-avc' },
          { todasEspecialidades: false, especialidadeId: 'mama', subespecialidadeId: null },
        ],
      });
      await repo.salvar({ frente: MAMA, ...antigas });

      await definir.executar(ator, MAMA, { ...antigas, tetoPorMedico: 10 });

      expect((await repo.obter(MAMA))?.tetoPorMedico).toBe(10);
    });
  });

  it('lista só as frentes cadastradas', async () => {
    await definir.executar(ator, CT, editadas({ distribuiPeloRobo: false }));
    const listar = new ListarRegrasFrente(repo);
    expect(await listar.executar()).toEqual([
      { frente: CT, ...editadas({ distribuiPeloRobo: false }) },
    ]);
  });
});
