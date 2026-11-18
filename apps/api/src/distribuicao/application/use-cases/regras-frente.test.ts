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
    cadastros.existentes.set('prioridade', new Set(['rot']));
    auditoria = new InMemoryAuditoria();
    obter = new ObterRegrasFrente(repo, cadastros);
    definir = new DefinirRegrasFrente(repo, cadastros, auditoria, () => agora);
  });

  it('frente sem cadastro: as regras neutras, sem campos da Lista (seguem o padrão)', async () => {
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
    const mama = editadas({ listaPrazoMinimoHoras: null, recolheAoFimDoTurno: false });
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
        antes: { listaPrazoMinimoHoras: undefined, recolheAoFimDoTurno: true },
        depois: { listaPrazoMinimoHoras: null, recolheAoFimDoTurno: false, frente: MAMA },
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
      definir.executar(ator, MAMA, editadas({ listaPrioridadeIds: ['sumiu'] })),
    ).rejects.toThrow(/Prioridade não encontrada/);
    expect(repo.gravacoes).toBe(0);
  });

  it('lista só as frentes cadastradas', async () => {
    await definir.executar(ator, CT, editadas({ distribuiPeloRobo: false }));
    const listar = new ListarRegrasFrente(repo);
    expect(await listar.executar()).toEqual([
      { frente: CT, ...editadas({ distribuiPeloRobo: false }) },
    ]);
  });
});
