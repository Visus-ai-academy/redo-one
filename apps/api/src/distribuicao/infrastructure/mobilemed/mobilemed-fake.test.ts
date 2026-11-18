import { describe, expect, it } from 'vitest';

import type { AmostraCatalogo } from './fila-sintetica';
import { MobileMedFake } from './mobilemed-fake';

const amostra: AmostraCatalogo = {
  exames: [{ nome: 'RM CRANIO', modalidade: 'MR', especialidade: 'NEURO' }],
  clientes: ['HOSPITAL A'],
  medicosMobilemed: [101, 102],
};
const relogio = (iso: string) => () => new Date(iso);
const criar = (opcoes: Partial<{ tamanho: number; falhasPct: number }> = {}) =>
  new MobileMedFake(async () => amostra, relogio('2026-11-18T12:34:00Z'), {
    tamanho: opcoes.tamanho ?? 20,
    semente: 3,
    falhasPct: opcoes.falhasPct ?? 0,
  });

describe('MobileMed fake (fila sintética e atribuição que só registra)', () => {
  it('lê a fila sintética com o tamanho configurado, estável dentro da mesma hora', async () => {
    const fake = criar();
    const a = await fake.ler();
    expect(a.semMedico).toHaveLength(20);
    expect(await fake.ler()).toEqual(a);
  });

  it('o exame atribuído sai da fila sem médico e passa a estar em mãos do médico', async () => {
    const fake = criar();
    const [primeiro] = (await fake.ler()).semMedico;
    const idExame = primeiro?.idExame ?? '';

    expect(await fake.atribuir({ idExame, medicoIdMobilemed: 101 })).toEqual({
      status: 'executada',
    });

    const depois = await fake.ler();
    expect(depois.semMedico.map((e) => e.idExame)).not.toContain(idExame);
    expect(depois.emMaos).toContainEqual(
      expect.objectContaining({ idExame, medicoIdMobilemed: 101 }),
    );
  });

  it('pula o exame que já não está sem médico, sem tentar de novo', async () => {
    const fake = criar();
    const [primeiro] = (await fake.ler()).semMedico;
    const idExame = primeiro?.idExame ?? '';
    await fake.atribuir({ idExame, medicoIdMobilemed: 101 });

    expect(await fake.atribuir({ idExame, medicoIdMobilemed: 102 })).toMatchObject({
      status: 'pulada',
      motivo: 'saiu_da_fila',
      retentavel: false,
    });
    expect(await fake.atribuir({ idExame: 'nao-existe', medicoIdMobilemed: 102 })).toMatchObject({
      status: 'pulada',
      retentavel: false,
    });
  });

  it('com falhas ligadas, falha alguns na primeira tentativa (retentável) e acerta ao retomar', async () => {
    const fake = criar({ tamanho: 100, falhasPct: 20 });
    const { semMedico } = await fake.ler();
    const primeira = await Promise.all(
      semMedico.map((e) => fake.atribuir({ idExame: e.idExame, medicoIdMobilemed: 101 })),
    );
    const falhas = semMedico.filter((_, i) => primeira[i]?.status === 'falhou');
    expect(falhas.length).toBeGreaterThan(5);
    expect(falhas.length).toBeLessThan(40);
    expect(primeira.find((x) => x.status === 'falhou')).toMatchObject({
      motivo: 'sessao_caiu',
      retentavel: true,
    });

    const segunda = await Promise.all(
      falhas.map((e) => fake.atribuir({ idExame: e.idExame, medicoIdMobilemed: 101 })),
    );
    expect(segunda.every((x) => x.status === 'executada')).toBe(true);
  });

  it('devolve o nome do paciente só dos exames pedidos que estão na fila', async () => {
    const fake = criar();
    const [a, b] = (await fake.ler()).semMedico;
    const nomes = await fake.nomesPacientes([a?.idExame ?? '', 'fora-da-fila']);
    expect([...nomes.keys()]).toEqual([a?.idExame]);
    expect(nomes.get(a?.idExame ?? '')).toBe(a?.paciente.nome);
    expect(nomes.has(b?.idExame ?? '')).toBe(false);
  });
});
