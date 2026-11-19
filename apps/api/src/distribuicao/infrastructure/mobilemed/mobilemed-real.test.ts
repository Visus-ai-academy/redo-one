import { describe, expect, it } from 'vitest';

import { ClienteMobileMed } from '../../../comum/mobilemed/cliente-mobilemed';
import { flagsResetSla, MobileMedReal } from './mobilemed-real';

type Exame = Record<string, unknown> & { id: number; status_id: number; usuario_id: unknown };

const exame = (id: number, extra: Partial<Exame> = {}): Exame => ({
  id,
  status_id: 0,
  usuario_id: null,
  estudo_descricao: 'RM CRANIO',
  nome_fantasia: 'HOSPITAL A',
  modalidade: 'MR',
  prioridade_id: 1,
  data_realizacao: '2026-11-18T10:00:00.000Z',
  data_transferencia_final: '2026-11-18T10:30:00.000Z',
  sla_expiration_date: '2026-11-20T10:00:00.000Z',
  nome_paciente: `PACIENTE ${id}`,
  codigo_paciente: `C${id}`,
  empresa: { exigir_motivo: false, permissao_sla_medico: true },
  is_complementar: null,
  is_duplicado: false,
  is_original: 0,
  ...extra,
});

interface Corpo {
  exames?: {
    filtro: {
      medicos: number[];
      array_status_id: number[] | null;
      pesquisa_id_exame: number | null;
    };
    paginacao: { pagina: number; total_registros: number };
  };
  exame?: { id: number; usuario_id: number };
}

/**
 * MobileMed simulada na memória (o fetch é injetado): `POST /exame/lista`, `GET /exame/{id}`,
 * `PUT /exame` e `POST /usuario/lista/empresa`. Nenhuma requisição sai do processo.
 */
const simulada = (exames: Exame[]) => {
  const base = new Map(exames.map((e) => [e.id, e]));
  const puts: Corpo['exame'][] = [];
  const rotas: string[] = [];
  const falhas: Record<string, number[]> = {};
  const ajustes = { totalAMais: 0, ignorarPut: false, medicos: [{ id: 101, nome: 'Dra. A' }] };
  const resp = (corpo: unknown, status = 200) => new Response(JSON.stringify(corpo), { status });
  const fn = (async (url: string, init: RequestInit) => {
    const caminho = url.replace('http://mm.teste/portal-api', '');
    const rota = `${init.method} ${caminho.replace(/\/\d+/, '/{id}')}`;
    rotas.push(rota);
    const falha = falhas[rota]?.shift();
    if (falha) return resp({}, falha);
    const corpo = init.body ? (JSON.parse(String(init.body)) as Corpo) : {};
    if (rota === 'POST /exame/lista' && corpo.exames) {
      const { filtro, paginacao } = corpo.exames;
      const todos = [...base.values()].filter((e) =>
        filtro.pesquisa_id_exame !== null
          ? e.id === filtro.pesquisa_id_exame
          : (filtro.medicos[0] === 0 ? !e.usuario_id : true) &&
            (!filtro.array_status_id || filtro.array_status_id.includes(e.status_id)),
      );
      const { pagina, total_registros: n } = paginacao;
      return resp({
        lista: todos.slice((pagina - 1) * n, pagina * n),
        paginacao: {
          total: todos.length + ajustes.totalAMais,
          current_page: pagina,
          last_page: Math.max(1, Math.ceil(todos.length / n)),
        },
      });
    }
    if (rota === 'GET /exame/{id}') {
      const e = base.get(Number(caminho.split('/').pop()));
      return e ? resp({ exame: e }) : resp({ error_code: 'NAO_ENCONTRADO' }, 404);
    }
    if (rota === 'PUT /exame' && corpo.exame) {
      puts.push(corpo.exame);
      const e = base.get(corpo.exame.id);
      if (e && !ajustes.ignorarPut) e.usuario_id = corpo.exame.usuario_id || null;
      return resp({});
    }
    if (rota === 'POST /usuario/lista/empresa') return resp({ lista: ajustes.medicos });
    return resp({}, 404);
  }) as unknown as typeof fetch;
  const cliente = new ClienteMobileMed({
    baseUrl: 'http://mm.teste/portal-api',
    token: { accessToken: async () => 'tok', descartar: () => {} },
    timeoutMs: 1_000,
    concorrencia: 1,
    limiteAnomalias: 2,
    fetch: fn,
  });
  const mm = new MobileMedReal(cliente, { porPagina: 2, maximoExames: 100 });
  return { mm, base, puts, rotas, falhas, ajustes };
};

const pedido = (idExame: string, medicoIdMobilemed: number, de: number | null = null) => ({
  idExame,
  medicoIdMobilemed,
  deMedicoIdMobilemed: de,
});

describe('MobileMedReal: leitura da fila', () => {
  it('lê todas as páginas: sem médico (inclusive o aberto) e em mãos dos não laudados', async () => {
    const { mm } = simulada([
      exame(1),
      exame(2, { prioridade_id: 3 }),
      exame(3, { status_id: 10 }),
      exame(4, { usuario_id: '101' }),
      exame(5, { usuario_id: 102, status_id: 2 }),
      exame(6, { usuario_id: 103, status_id: 1 }),
    ]);
    const { semMedico, emMaos } = await mm.ler();
    expect(semMedico.map((e) => [e.idExame, e.status, e.prioridade])).toEqual([
      ['1', 'NOVO', 'Rotina'],
      ['2', 'NOVO', 'Urgência'],
      ['3', 'PRE-LAUDADO', 'Rotina'],
    ]);
    expect(semMedico[0]).toMatchObject({
      estudo: 'RM CRANIO',
      unidade: 'HOSPITAL A',
      modalidade: 'MR',
      laudos: null,
      realizadoEm: new Date('2026-11-18T10:00:00.000Z'),
      entradaEm: new Date('2026-11-18T10:30:00.000Z'),
      prazo: new Date('2026-11-20T10:00:00.000Z'),
      paciente: { codigo: 'C1', nome: 'PACIENTE 1' },
    });
    expect(emMaos.map((e) => [e.idExame, e.medicoIdMobilemed, e.status])).toEqual([
      ['4', 101, 'NOVO'],
      ['5', 102, 'LAUDANDO'],
    ]);
  });

  it('falha inteira se as páginas não fecham com o total', async () => {
    const { mm, ajustes } = simulada([exame(1), exame(2), exame(3)]);
    ajustes.totalAMais = 1;
    await expect(mm.ler()).rejects.toThrow(/MobileMed: .*(paginação|3 de 4)/);
  });

  it('falha inteira com prioridade ou status desconhecidos', async () => {
    await expect(simulada([exame(1, { prioridade_id: 9 })]).mm.ler()).rejects.toThrow(
      'prioridade_id 9 desconhecida',
    );
    await expect(simulada([exame(1, { status_id: 42 })]).mm.ler()).rejects.toThrow(
      'status_id 42 desconhecido',
    );
  });

  it('falha inteira com item fora do formato, sem expor o valor', async () => {
    const { mm } = simulada([exame(1, { estudo_descricao: 7, nome_paciente: 'JOSE' })]);
    const erro = await mm.ler().catch((e: Error) => e);
    expect(String(erro)).toContain('estudo_descricao');
    expect(String(erro)).not.toContain('JOSE');
  });

  it('recusa total acima do máximo (filtro ignorado traria o histórico)', async () => {
    const { mm } = simulada(Array.from({ length: 101 }, (_, i) => exame(i + 1)));
    await expect(mm.ler()).rejects.toThrow('acima do máximo de 100');
  });

  it('leituras ao mesmo tempo dividem as mesmas chamadas', async () => {
    const { mm, rotas } = simulada([exame(1)]);
    await Promise.all([mm.ler(), mm.ler()]);
    expect(rotas).toEqual(['POST /exame/lista', 'POST /exame/lista']);
  });

  it('nome do paciente por id, fora os laudados', async () => {
    const { mm } = simulada([exame(1), exame(2, { status_id: 5, usuario_id: 9 })]);
    expect(await mm.nomesPacientes(['1', '2', '3', 'x'])).toEqual(new Map([['1', 'PACIENTE 1']]));
  });

  it('intocados: NOVO e com o mesmo dono de quando foi lido', async () => {
    const { mm } = simulada([
      exame(1),
      exame(2, { usuario_id: 101 }),
      exame(3, { usuario_id: 101, status_id: 2 }),
    ]);
    const r = await mm.intocados([
      { idExame: '1', medicoIdMobilemed: null },
      { idExame: '2', medicoIdMobilemed: 101 },
      { idExame: '2', medicoIdMobilemed: null },
      { idExame: '3', medicoIdMobilemed: 101 },
      { idExame: '9', medicoIdMobilemed: null },
    ]);
    expect([...r]).toEqual(['1', '2']);
  });
});

describe('MobileMedReal: atribuir, trocar e tirar', () => {
  it('atribui com o corpo mínimo e confirma relendo', async () => {
    const { mm, puts, rotas, base } = simulada([exame(1)]);
    expect(await mm.atribuir(pedido('1', 101))).toEqual({ status: 'executada' });
    expect(rotas).toEqual(['GET /exame/{id}', 'PUT /exame', 'GET /exame/{id}']);
    expect(puts).toEqual([
      {
        id: 1,
        usuario_id: 101,
        is_complementar: false,
        is_duplicado: false,
        is_original: false,
        alterarSla: false,
        alterarSlaEmpresaCompartilhada: false,
      },
    ]);
    expect(base.get(1)?.usuario_id).toBe(101);
  });

  it('pula sem gravar: assinado, aberto, já com médico, sumiu, unidade exige motivo', async () => {
    const { mm, puts } = simulada([
      exame(1, { status_id: 1 }),
      exame(2, { status_id: 2 }),
      exame(3, { usuario_id: 102 }),
      exame(4, { empresa: { exigir_motivo: true } }),
    ]);
    const motivos = [];
    for (const id of ['1', '2', '3', '9', '4']) {
      const r = await mm.atribuir(pedido(id, 101));
      motivos.push(r.status === 'executada' ? r.status : `${r.status}:${r.motivo}`);
    }
    expect(motivos).toEqual([
      'pulada:assinado',
      'pulada:exame_ja_aberto',
      'pulada:ja_tem_medico',
      'pulada:saiu_da_fila',
      'pulada:unidade_exige_motivo',
    ]);
    expect(puts).toHaveLength(0);
  });

  it('troca (recolhimento) só se o dono segue o mesmo e NOVO', async () => {
    const { mm, puts } = simulada([
      exame(1, { usuario_id: 101 }),
      exame(2, { usuario_id: 103 }),
      exame(3, { usuario_id: 101, status_id: 2 }),
    ]);
    expect(await mm.atribuir(pedido('1', 102, 101))).toEqual({ status: 'executada' });
    expect(await mm.atribuir(pedido('2', 102, 101))).toMatchObject({ motivo: 'mudou_de_dono' });
    expect(await mm.atribuir(pedido('3', 102, 101))).toMatchObject({
      motivo: 'exame_ja_aberto',
    });
    expect(puts.map((p) => p?.usuario_id)).toEqual([102]);
  });

  it('tira o médico com usuario_id 0', async () => {
    const { mm, puts, base } = simulada([exame(1, { usuario_id: 101 })]);
    expect(await mm.tirar('1', 101)).toEqual({ status: 'executada' });
    expect(puts[0]?.usuario_id).toBe(0);
    expect(base.get(1)?.usuario_id).toBeNull();
  });

  it('já com o médico pedido (nova tentativa) conta como feito, sem gravar de novo', async () => {
    const { mm, puts } = simulada([exame(1, { usuario_id: 101 })]);
    expect(await mm.atribuir(pedido('1', 101))).toEqual({ status: 'executada' });
    expect(puts).toHaveLength(0);
  });

  it('sem confirmação na releitura: falhou e retentável', async () => {
    const { mm, ajustes } = simulada([exame(1)]);
    ajustes.ignorarPut = true;
    expect(await mm.atribuir(pedido('1', 101))).toMatchObject({
      status: 'falhou',
      motivo: 'nao_confirmado',
      retentavel: true,
    });
  });

  it('para o lote depois de 2 anomalias seguidas, sem chamar a MobileMed', async () => {
    const { mm, falhas, rotas } = simulada([exame(1), exame(2), exame(3)]);
    falhas['GET /exame/{id}'] = [503, 429];
    expect(await mm.atribuir(pedido('1', 101))).toMatchObject({
      motivo: 'mobilemed_indisponivel',
      retentavel: true,
    });
    expect(await mm.atribuir(pedido('2', 101))).toMatchObject({ motivo: 'mobilemed_indisponivel' });
    const chamadas = rotas.length;
    expect(await mm.atribuir(pedido('3', 101))).toMatchObject({
      status: 'falhou',
      motivo: 'freio_mobilemed',
      retentavel: true,
    });
    expect(rotas).toHaveLength(chamadas);
  });

  it('sessão recusada na escrita: falhou e retentável (não repete o PUT)', async () => {
    const { mm, falhas } = simulada([exame(1)]);
    falhas['PUT /exame'] = [401];
    expect(await mm.atribuir(pedido('1', 101))).toMatchObject({
      motivo: 'sessao_caiu',
      retentavel: true,
    });
  });

  it('sessão recusada na leitura: renova e lê de novo', async () => {
    const { mm, falhas } = simulada([exame(1)]);
    falhas['GET /exame/{id}'] = [401];
    expect(await mm.atribuir(pedido('1', 101))).toEqual({ status: 'executada' });
  });
});

describe('flagsResetSla (porte do portal)', () => {
  const base = {
    id: 1,
    status_id: 0,
    usuario_id: null,
    empresa: { exigir_motivo: false, permissao_sla_medico: true },
    is_complementar: false,
    is_duplicado: false,
    is_original: false,
  };
  it('exame só da origem: o portal não liga nenhuma flag', () => {
    expect(flagsResetSla(base, 101)).toEqual({
      alterarSla: false,
      alterarSlaEmpresaCompartilhada: false,
    });
  });
  it('compartilhado, consultado na origem com permissão de SLA: alterarSla', () => {
    const e = { ...base, compartilhamentos: [{ empresa_compartilhada_id: 7 }], permissao: [1] };
    expect(flagsResetSla(e as never, 101).alterarSla).toBe(true);
    expect(flagsResetSla(e as never, null).alterarSla).toBe(false);
  });
  it('compartilhado fora da origem: a permissão do compartilhamento da unidade do SLA', () => {
    const e = {
      ...base,
      sla_empresa_id: 7,
      compartilhamentos: [{ empresa_compartilhada_id: 7, permissao_sla_medico: true }],
    };
    expect(flagsResetSla(e as never, 101)).toEqual({
      alterarSla: false,
      alterarSlaEmpresaCompartilhada: true,
    });
  });
});

describe('MobileMedReal: médicos da unidade', () => {
  it('lista id e nome dos médicos ativos da unidade', async () => {
    const { mm, rotas } = simulada([]);
    expect(await mm.medicosDaUnidade(55)).toEqual([{ id: 101, nome: 'Dra. A' }]);
    expect(rotas).toEqual(['POST /usuario/lista/empresa']);
  });
});
