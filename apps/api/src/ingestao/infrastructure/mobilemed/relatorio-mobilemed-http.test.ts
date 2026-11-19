import { describe, expect, it } from 'vitest';

import { ClienteMobileMed, ErroMobileMed } from '../../../comum/mobilemed/cliente-mobilemed';
import { RelatorioMobileMedError } from '../../application/ports/relatorio-mobilemed';
import { converterLinha } from '../../domain/linha-planilha';
import { RelatorioMobileMedHttp } from './relatorio-mobilemed-http';

const BASE = 'https://reports.teste';

/** Item como a MobileMed devolve (paciente fictício), com campos que a ingestão descarta. */
const item = (campos: Record<string, unknown> = {}) => ({
  id: 991,
  nome_fantasia: 'CLINICA X',
  codigo_paciente: '00123',
  identidade_paciente: 'RG-FICTICIO',
  cpf_paciente: '000.000.000-00',
  nome_paciente: 'PACIENTE FICTICIO',
  identidade_convenio: 'CARTEIRINHA',
  convenio: 'PLANO',
  estudo_descricao: 'TC TORAX',
  pacs_accession_no: 'A1',
  modalidade_id: 3,
  prioridade_id: 1,
  status_id: 1,
  valor: '1.00',
  valores: null,
  especialidade: 'MEDICINA INTERNA',
  medico: 'Dra. Ana',
  is_duplicado: false,
  is_complementar: 0,
  is_anterior: 0,
  data_realizacao: '2026-10-05T11:00:00.000Z',
  data_criacao: '2026-10-05T11:30:00.000Z',
  data_laudo: '2026-10-06T13:15:42.512Z',
  sla_expiration_date: '2026-10-07T11:00:00.000Z',
  ...campos,
});

function criar(respostas: ((corpo: { filtro: Record<string, unknown> }) => unknown)[]) {
  const chamadas: { url: string; corpo: { filtro: Record<string, unknown> } }[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    const corpo = JSON.parse(String(init.body));
    chamadas.push({ url, corpo });
    const responder = respostas.shift() ?? (() => ({ status_code: 200, lista: [] }));
    const resposta = responder(corpo);
    return resposta instanceof Response
      ? resposta
      : new Response(JSON.stringify(resposta), { status: 200 });
  }) as unknown as typeof globalThis.fetch;
  const relatorio = new RelatorioMobileMedHttp(
    new ClienteMobileMed({
      baseUrl: BASE,
      token: { accessToken: async () => 'tok' },
      timeoutMs: 1_000,
      concorrencia: 1,
      limiteAnomalias: 2,
      fetch,
    }),
  );
  return { relatorio, chamadas };
}

const periodo = { inicio: '2026-10-01', fim: '2026-10-07' };
const fatiamento = { janelaDias: 7, teto: 50_000 };

describe('RelatorioMobileMedHttp', () => {
  it('laudos: junta o "no padrão" e o "fora do padrão" do período numa leitura só', async () => {
    const { relatorio, chamadas } = criar([
      () => ({ status_code: 200, lista: [item()] }),
      () => ({ status_code: 200, lista: [item({ estudo_descricao: 'RX OIT TORAX' })] }),
    ]);

    const lida = await relatorio.buscar('laudos', periodo, fatiamento);

    expect(chamadas.map((c) => c.url)).toEqual([
      `${BASE}/exame/relatorio/descritivoEspecialidade`,
      `${BASE}/exame/relatorio/descritivoEspecialidade`,
    ]);
    expect(chamadas.map((c) => c.corpo.filtro.exibirNaoTratados)).toEqual([false, '1']);
    expect(chamadas[0]?.corpo.filtro).toMatchObject({
      data_laudo: {
        data_inicial: '2026-10-01T03:00:00.000Z',
        data_final: '2026-10-08T02:59:59.999Z',
      },
      isEspecialidades: true,
      perfis: [1, 2, 9],
    });
    expect(lida.formato).toBe('laudos');
    expect(lida.linhas.map((l) => [l.numero, l.registro.ESTUDO_DESCRICAO])).toEqual([
      [1, 'TC TORAX'],
      [2, 'RX OIT TORAX'],
    ]);
  });

  it('compartilhamento: a rota e o filtro próprios', async () => {
    const { relatorio, chamadas } = criar([
      () => ({ lista: [item({ is_compartilhamento_enviado_para: 'CRD_APOIO' })] }),
    ]);

    const lida = await relatorio.buscar('compartilhamento', periodo, fatiamento);

    expect(chamadas).toHaveLength(1);
    expect(chamadas[0]?.url).toBe(`${BASE}/exame/relatorio/examesCompartilhados`);
    expect(chamadas[0]?.corpo.filtro).toMatchObject({
      tipoAssinatura: 1,
      isEspecialidades: false,
      tipoAcao: { id: null, descricao: 'TODOS' },
      compartilhamento: 'todos',
      isRelatorioExamesCompartilhados: true,
    });
    expect(lida.linhas[0]?.registro).toMatchObject({ EMPRESA: 'CRD_APOIO' });
  });

  it('monta a linha com as colunas da planilha e sem o que a ingestão não usa', async () => {
    const { relatorio } = criar([() => ({ lista: [item()] })]);

    const [linha] = (await relatorio.buscar('laudos', periodo, fatiamento)).linhas;
    const registro = linha?.registro ?? {};

    expect(registro).toMatchObject({
      EMPRESA: 'CLINICA X',
      CODIGO_PACIENTE: '00123',
      ACCESSION_NUMBER: 'A1',
      PRIORIDADE: 'Rotina',
      STATUS: 'Assinado',
      DUPLICADO: 'Não',
      COMPLEMENTAR: 'Não',
      // Brasília e truncado no segundo, como a planilha.
      DATA_LAUDO: '06/10/2026',
      HORA_LAUDO: '10:15:42',
      DATA_REALIZACAO: '05/10/2026',
      HORA_REALIZACAO: '08:00:00',
    });
    const texto = JSON.stringify(registro);
    for (const descartado of ['000.000.000-00', 'RG-FICTICIO', 'CARTEIRINHA', 'PLANO']) {
      expect(texto).not.toContain(descartado);
    }
    expect(converterLinha(registro)).toMatchObject({
      modalidade: 'CR',
      dataLaudo: new Date('2026-10-06T13:15:42.000Z'),
    });
  });

  it('refaz em metades a janela que voltou no teto', async () => {
    const { relatorio, chamadas } = criar([
      () => ({ lista: [item(), item()] }),
      () => ({ lista: [item()] }),
      () => ({ lista: [item()] }),
    ]);

    const lida = await relatorio.buscar('compartilhamento', periodo, { janelaDias: 7, teto: 2 });

    expect(lida.linhas).toHaveLength(2);
    expect(
      chamadas.map((c) => (c.corpo.filtro.data_laudo as { data_inicial: string }).data_inicial),
    ).toEqual(['2026-10-01T03:00:00.000Z', '2026-10-01T03:00:00.000Z', '2026-10-04T15:00:00.000Z']);
  });

  it('refaz a janela em que a MobileMed cancelou a consulta (499) e segue', async () => {
    const cancelada = () =>
      new Response(JSON.stringify({ error_code: 499, error_msg: 'Requisição cancelada' }), {
        status: 499,
      });
    const { relatorio, chamadas } = criar([cancelada, () => ({ lista: [item()] })]);

    const lida = await relatorio.buscar('compartilhamento', periodo, fatiamento);

    expect(chamadas).toHaveLength(2);
    expect(lida.linhas).toHaveLength(1);
  });

  it('desiste depois de 3 tentativas na mesma janela', async () => {
    const cancelada = () => new Response(JSON.stringify({ error_code: 499 }), { status: 499 });
    const { relatorio, chamadas } = criar([cancelada, cancelada, cancelada, cancelada]);

    const erro = await relatorio.buscar('compartilhamento', periodo, fatiamento).catch((e) => e);

    expect(erro).toBeInstanceOf(RelatorioMobileMedError);
    expect((erro as Error).message).toBe(
      'A MobileMed não respondeu à consulta do relatório, nem depois de 3 tentativas. Nada foi importado nem removido. Tente de novo em alguns minutos.',
    );
    expect(chamadas).toHaveLength(3);
  });

  it('login recusado diz que é o acesso do One à MobileMed', async () => {
    const relatorio = new RelatorioMobileMedHttp(
      new ClienteMobileMed({
        baseUrl: BASE,
        token: {
          accessToken: async () => {
            throw new ErroMobileMed('sessao', 'MobileMed: o login foi recusado (HTTP 401).');
          },
        },
        timeoutMs: 1_000,
        concorrencia: 1,
        limiteAnomalias: 2,
      }),
    );

    const erro = await relatorio.buscar('laudos', periodo, fatiamento).catch((e: unknown) => e);

    expect((erro as Error).message).toBe(
      'O One não conseguiu entrar na MobileMed. Nada foi importado nem removido. Peça ao suporte técnico para conferir o acesso do One à MobileMed.',
    );
  });

  it('consulta recusada não mostra rota nem código HTTP', async () => {
    const { relatorio } = criar([
      () => new Response(JSON.stringify({ error_code: 'E42' }), { status: 422 }),
    ]);

    const erro = await relatorio.buscar('laudos', periodo, fatiamento).catch((e: unknown) => e);

    expect((erro as Error).message).toBe(
      'A MobileMed recusou a consulta do relatório. Nada foi importado nem removido. Avise o suporte técnico.',
    );
  });

  it('resposta fora do formato derruba a leitura inteira, sem dado de paciente na mensagem', async () => {
    const { relatorio } = criar([() => ({ lista: [item(), item({ data_laudo: '06/10/2026' })] })]);

    const erro = await relatorio.buscar('laudos', periodo, fatiamento).catch((e: unknown) => e);

    expect(erro).toBeInstanceOf(RelatorioMobileMedError);
    expect((erro as Error).message).toBe(
      'A MobileMed devolveu o relatório num formato que o One não reconhece. Nada foi importado nem removido. Avise o suporte técnico: ela pode ter mudado o relatório.',
    );
    expect((erro as Error).message).not.toContain('PACIENTE');
  });

  it('data sem fuso é recusada (seria lida no fuso do servidor)', async () => {
    const { relatorio } = criar([() => ({ lista: [item({ data_laudo: '2026-10-06T13:15:42' })] })]);

    await expect(relatorio.buscar('laudos', periodo, fatiamento)).rejects.toBeInstanceOf(
      RelatorioMobileMedError,
    );
  });
});
