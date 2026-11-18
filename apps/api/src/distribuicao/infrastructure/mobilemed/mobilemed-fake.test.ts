import { describe, expect, it } from 'vitest';

import type { AmostraCatalogo } from './fila-sintetica';
import { MobileMedFake } from './mobilemed-fake';

const amostra: AmostraCatalogo = {
  exames: [{ nome: 'RM CRANIO', modalidade: 'MR', especialidade: 'NEURO' }],
  clientes: ['HOSPITAL A'],
  medicosMobilemed: [101, 102],
};
const relogio = (iso: string) => () => new Date(iso);
type Opcoes = Partial<{
  tamanho: number;
  falhasPct: number;
  porForaPct: number;
  abertosPct: number;
  entregues: AmostraCatalogo['entregues'];
}>;
const criar = (opcoes: Opcoes = {}) =>
  new MobileMedFake(
    async () => ({ ...amostra, entregues: opcoes.entregues ?? [] }),
    relogio('2026-11-18T12:34:00Z'),
    {
      tamanho: opcoes.tamanho ?? 20,
      semente: 3,
      falhasPct: opcoes.falhasPct ?? 0,
      porForaPct: opcoes.porForaPct ?? 0,
      abertosPct: opcoes.abertosPct ?? 0,
    },
  );
const semDono = (ids: (string | undefined)[]) =>
  ids.map((id) => ({ idExame: id ?? '', medicoIdMobilemed: null }));

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

    expect(
      await fake.atribuir({ idExame, medicoIdMobilemed: 101, deMedicoIdMobilemed: null }),
    ).toEqual({
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
    await fake.atribuir({ idExame, medicoIdMobilemed: 101, deMedicoIdMobilemed: null });

    expect(
      await fake.atribuir({ idExame, medicoIdMobilemed: 102, deMedicoIdMobilemed: null }),
    ).toMatchObject({
      status: 'pulada',
      motivo: 'saiu_da_fila',
      retentavel: false,
    });
    expect(
      await fake.atribuir({
        idExame: 'nao-existe',
        medicoIdMobilemed: 102,
        deMedicoIdMobilemed: null,
      }),
    ).toMatchObject({
      status: 'pulada',
      retentavel: false,
    });
  });

  it('com falhas ligadas, falha alguns na primeira tentativa (retentável) e acerta ao retomar', async () => {
    const fake = criar({ tamanho: 100, falhasPct: 20 });
    const { semMedico } = await fake.ler();
    const primeira = await Promise.all(
      semMedico.map((e) =>
        fake.atribuir({ idExame: e.idExame, medicoIdMobilemed: 101, deMedicoIdMobilemed: null }),
      ),
    );
    const falhas = semMedico.filter((_, i) => primeira[i]?.status === 'falhou');
    expect(falhas.length).toBeGreaterThan(5);
    expect(falhas.length).toBeLessThan(40);
    expect(primeira.find((x) => x.status === 'falhou')).toMatchObject({
      motivo: 'sessao_caiu',
      retentavel: true,
    });

    const segunda = await Promise.all(
      falhas.map((e) =>
        fake.atribuir({ idExame: e.idExame, medicoIdMobilemed: 101, deMedicoIdMobilemed: null }),
      ),
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

  it('confere quem segue sem médico: o já atribuído sai da resposta', async () => {
    const fake = criar();
    const [a, b] = (await fake.ler()).semMedico;
    await fake.atribuir({
      idExame: a?.idExame ?? '',
      medicoIdMobilemed: 101,
      deMedicoIdMobilemed: null,
    });
    expect(await fake.intocados(semDono([a?.idExame, b?.idExame, 'nao-existe']))).toEqual(
      new Set([b?.idExame]),
    );
  });

  it('com "por fora" ligado, parte dos exames conferidos já ganhou médico fora do robô', async () => {
    const fake = criar({ tamanho: 100, porForaPct: 30 });
    const ids = (await fake.ler()).semMedico.map((e) => e.idExame);
    const livres = await fake.intocados(semDono(ids));
    expect(livres.size).toBeLessThan(90);
    expect(livres.size).toBeGreaterThan(40);
    const porFora = ids.find((id) => !livres.has(id)) ?? '';
    expect((await fake.ler()).semMedico.map((e) => e.idExame)).not.toContain(porFora);
    expect(
      await fake.atribuir({ idExame: porFora, medicoIdMobilemed: 101, deMedicoIdMobilemed: null }),
    ).toMatchObject({
      status: 'pulada',
    });
  });

  it('as entregas gravadas no banco (rodadas anteriores) seguem com o médico, NOVO', async () => {
    const [a] = (await criar().ler()).semMedico;
    const idExame = a?.idExame ?? '';
    const fake = criar({ entregues: [{ idExame, medicoIdMobilemed: 102 }] });
    const leitura = await fake.ler();
    expect(leitura.semMedico.map((e) => e.idExame)).not.toContain(idExame);
    expect(leitura.emMaos).toContainEqual(
      expect.objectContaining({ idExame, medicoIdMobilemed: 102, status: 'NOVO' }),
    );
    expect((await fake.nomesPacientes([idExame])).get(idExame)).toBe(a?.paciente.nome);
  });

  it('com "abertos" ligado, parte dos exames com médico está LAUDANDO', async () => {
    const fake = criar({ tamanho: 200, abertosPct: 30 });
    const { emMaos } = await fake.ler();
    const abertos = emMaos.filter((e) => e.status === 'LAUDANDO').length;
    expect(abertos).toBeGreaterThan(emMaos.length * 0.1);
    expect(abertos).toBeLessThan(emMaos.length * 0.6);
  });

  it('recolhido: troca de médico só se segue NOVO com quem o tinha', async () => {
    const [a, b] = (await criar().ler()).semMedico;
    const ida = a?.idExame ?? '';
    const idb = b?.idExame ?? '';
    const fake = criar({
      entregues: [
        { idExame: ida, medicoIdMobilemed: 101 },
        { idExame: idb, medicoIdMobilemed: 101 },
      ],
    });
    expect(
      await fake.atribuir({ idExame: ida, medicoIdMobilemed: 102, deMedicoIdMobilemed: 101 }),
    ).toEqual({ status: 'executada' });
    expect((await fake.ler()).emMaos).toContainEqual(
      expect.objectContaining({ idExame: ida, medicoIdMobilemed: 102 }),
    );
    expect(
      await fake.atribuir({ idExame: idb, medicoIdMobilemed: 102, deMedicoIdMobilemed: 103 }),
    ).toMatchObject({ status: 'pulada', motivo: 'mudou_de_dono', retentavel: false });
    expect(
      await fake.intocados([
        { idExame: ida, medicoIdMobilemed: 101 },
        { idExame: idb, medicoIdMobilemed: 101 },
      ]),
    ).toEqual(new Set([idb]));
  });
});
