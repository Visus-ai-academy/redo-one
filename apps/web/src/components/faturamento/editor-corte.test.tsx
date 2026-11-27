import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ResponseError } from '../../gen/.kubb/client';
import { competenciasControllerListar } from '../../gen/clients/competenciasControllerListar';
import { cortesControllerCriar } from '../../gen/clients/cortesControllerCriar';
import { cortesControllerListar } from '../../gen/clients/cortesControllerListar';
import { cortesControllerPrevia } from '../../gen/clients/cortesControllerPrevia';
import type { VigenciaCorteDto } from '../../gen/types/VigenciaCorteDto';
import { acharAviso } from '../../test/avisos';
import { renderComRotas } from '../../test/render';
import { escolherOpcao } from '../../test/select';
import { EditorCorte } from './editor-corte';

vi.mock('../../gen/clients/cortesControllerListar', () => ({ cortesControllerListar: vi.fn() }));
vi.mock('../../gen/clients/cortesControllerPrevia', () => ({ cortesControllerPrevia: vi.fn() }));
vi.mock('../../gen/clients/cortesControllerCriar', () => ({ cortesControllerCriar: vi.fn() }));
vi.mock('../../gen/clients/competenciasControllerListar', () => ({
  competenciasControllerListar: vi.fn(),
}));

const AGORA = new Date('2026-11-24T15:00:00.000Z');

const INICIAL: VigenciaCorteDto = {
  id: 'v-0',
  clienteId: null,
  desde: '2000-01',
  usaPadrao: false,
  dia: 7,
  ultimoDia: false,
  mes: 'seguinte',
  consideraExame: true,
  exameDia: null,
  exameUltimoDia: true,
  exameMes: 'proprio',
  criadoEm: '2026-11-01T12:00:00.000Z',
  criadoPor: null,
};

const listar = vi.mocked(cortesControllerListar);
const previa = vi.mocked(cortesControllerPrevia);
const criar = vi.mocked(cortesControllerCriar);

let porCliente: Record<string, VigenciaCorteDto[]>;

const resposta = <T,>(valor: T) => ({ unwrap: async () => valor }) as never;
const recusa = (message: string) =>
  ({
    unwrap: async () => {
      throw new ResponseError({ status: 409, data: { statusCode: 409, message } } as never);
    },
  }) as never;

beforeEach(() => {
  porCliente = { padrao: [INICIAL] };
  listar.mockReset();
  listar.mockImplementation(((opcoes: { query?: { clienteId?: string } }) =>
    resposta(porCliente[opcoes.query?.clienteId ?? 'padrao'] ?? [])) as never);
  vi.mocked(competenciasControllerListar).mockReturnValue(
    resposta({
      itens: [
        { competencia: '2026-11', status: 'aberta' },
        { competencia: '2026-10', status: 'fechada' },
        { competencia: '2026-09', status: 'fechada' },
      ],
      pagina: 1,
      porPagina: 100,
      total: 3,
    }),
  );
  previa.mockReset();
  previa.mockReturnValue(
    resposta({ alterados: 120, movimentos: [{ de: '2026-11', para: '2026-12', laudos: 120 }] }),
  );
  criar.mockReset();
  criar.mockReturnValue(resposta({ id: 'v-novo' }));
});

const editor = (props: Partial<Parameters<typeof EditorCorte>[0]> = {}) =>
  renderComRotas(
    <EditorCorte clienteId={null} podeEditar porPagina={10} agora={AGORA} {...props} />,
  );

describe('EditorCorte (padrão)', () => {
  it('mostra o corte em vigor em frase e o histórico; sem editar, não oferece nova vigência', async () => {
    editor({ podeEditar: false });
    expect(
      await screen.findAllByText(
        'Laudos assinados de 08 de um mês a 07 do seguinte; exames realizados de 01 ao último dia do próprio mês',
      ),
    ).toHaveLength(2);
    expect(screen.getByText('Desde o início')).toBeInTheDocument();
    expect(screen.getByText('Vigência inicial')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova vigência' })).not.toBeInTheDocument();
  });

  it('nova vigência: só competências depois da última fechada, prévia e depois salvar', async () => {
    editor();
    await userEvent.click(await screen.findByRole('button', { name: 'Nova vigência' }));
    await userEvent.click(screen.getByRole('combobox', { name: /A partir de/ }));
    const opcoes = (await screen.findAllByRole('option')).map((o) => o.textContent);
    expect(opcoes[0]).toBe('11/2026');
    expect(opcoes).not.toContain('10/2026');
    await userEvent.click(screen.getByRole('option', { name: '12/2026' }));
    await escolherOpcao('Dia do corte (data do laudo)', '25');
    expect(
      screen.getByText(/12\/2026 recebe os laudos assinados de 26\/12\/2026 a 25\/01\/2027/),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    const corpo = {
      clienteId: null,
      desde: '2026-12',
      usaPadrao: false,
      dia: 25,
      ultimoDia: false,
      mes: 'seguinte',
      consideraExame: true,
      exameDia: null,
      exameUltimoDia: true,
      exameMes: 'proprio',
    };
    expect(previa).toHaveBeenCalledWith({ body: corpo });
    expect(await screen.findByText('120 laudos mudam de competência.')).toBeInTheDocument();
    const movimento = screen.getByRole('listitem', { name: /11\/2026 para 12\/2026/ });
    expect(within(movimento).getByText('120 laudos')).toBeInTheDocument();
    expect(
      screen.getByText(/^Pelas datas do laudo e do exame, cada uma pelo seu corte/),
    ).toBeInTheDocument();
    expect(criar).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Salvar vigência' }));
    expect(criar).toHaveBeenCalledWith({ body: corpo });
    expect(await acharAviso()).toHaveTextContent(
      'Corte salvo a partir de 12/2026. Os laudos das competências abertas são recalculados em seguida.',
    );
    expect(screen.queryByRole('button', { name: 'Salvar vigência' })).not.toBeInTheDocument();
  });

  it('sem a data do exame, a nota da prévia fala só da data do laudo', async () => {
    editor();
    await userEvent.click(await screen.findByRole('button', { name: 'Nova vigência' }));
    await escolherOpcao('A partir de', '12/2026');
    await userEvent.click(screen.getByRole('switch', { name: /Considerar a data do exame/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(
      await screen.findByText(/^Pela data do laudo, só nas competências abertas/),
    ).toBeInTheDocument();
  });

  it('mudar um campo depois da prévia pede a prévia de novo', async () => {
    editor();
    await userEvent.click(await screen.findByRole('button', { name: 'Nova vigência' }));
    await escolherOpcao('A partir de', '12/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByRole('button', { name: 'Salvar vigência' })).toBeInTheDocument();
    await escolherOpcao('Mês do corte (data do laudo)', 'No próprio mês');
    expect(screen.queryByText('120 laudos mudam de competência.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver prévia' })).toBeInTheDocument();
    // Voltar ao valor da prévia não a traz de volta: os laudos podem ter mudado.
    await escolherOpcao('Mês do corte (data do laudo)', 'No mês seguinte');
    expect(screen.getByRole('button', { name: 'Ver prévia' })).toBeInTheDocument();
  });

  it('pede a competência antes da prévia', async () => {
    editor();
    await userEvent.click(await screen.findByRole('button', { name: 'Nova vigência' }));
    await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(
      await screen.findByText('Escolha a competência a partir da qual o corte vale.'),
    ).toBeInTheDocument();
    expect(previa).not.toHaveBeenCalled();
  });

  it('recusa da API aparece com a mensagem dela', async () => {
    const message = 'A vigência tem de começar depois da última competência fechada (11/2026).';
    previa.mockReturnValue(recusa(message));
    editor();
    await userEvent.click(await screen.findByRole('button', { name: 'Nova vigência' }));
    await escolherOpcao('A partir de', '11/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar vigência' })).not.toBeInTheDocument();
  });
});

describe('EditorCorte (data do exame)', () => {
  it('agrupa os campos em "Data do laudo" (obrigatório) e "Data do exame", com o período do exame', async () => {
    editor();
    await userEvent.click(await screen.findByRole('button', { name: 'Nova vigência' }));
    const laudo = screen.getByRole('group', { name: 'Data do laudo' });
    expect(within(laudo).getByText('Data do laudo')).toHaveTextContent('Data do laudo*');
    expect(
      within(screen.getByRole('group', { name: 'Data do exame' })).getByText('Data do exame'),
    ).toHaveTextContent(/^Data do exame$/);
    expect(
      within(laudo).getByRole('combobox', { name: 'Dia do corte (data do laudo)' }),
    ).toBeInTheDocument();
    const exame = screen.getByRole('group', { name: 'Data do exame' });
    expect(within(exame).getByRole('switch', { name: /Considerar a data do exame/ })).toBeChecked();
    expect(
      within(exame).getByRole('combobox', { name: 'Dia do corte (data do exame)' }),
    ).toHaveTextContent('Último dia do mês');
    expect(
      within(exame).getByRole('combobox', { name: 'Mês do corte (data do exame)' }),
    ).toHaveTextContent('No próprio mês');

    await escolherOpcao('A partir de', '12/2026');
    await escolherOpcao('Dia do corte (data do exame)', '25');
    expect(
      screen.getByText(
        /Laudos assinados de 08 de um mês a 07 do seguinte; exames realizados de 26 do mês anterior a 25 do próprio mês\./,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/exames realizados de 26\/11\/2026 a 25\/12\/2026 \(data do exame\)/),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(previa).toHaveBeenCalledWith({
      body: expect.objectContaining({ exameDia: 25, exameUltimoDia: false, exameMes: 'proprio' }),
    });
  });

  it('sem considerar a data do exame, os campos dele somem e a frase diz que só o laudo conta', async () => {
    editor();
    await userEvent.click(await screen.findByRole('button', { name: 'Nova vigência' }));
    await userEvent.click(screen.getByRole('switch', { name: /Considerar a data do exame/ }));
    expect(
      screen.queryByRole('combobox', { name: 'Dia do corte (data do exame)' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        /Laudos assinados de 08 de um mês a 07 do seguinte; só a data do laudo conta\./,
      ),
    ).toBeInTheDocument();
  });

  it('o histórico mostra o período do exame de cada vigência', async () => {
    porCliente = {
      padrao: [
        {
          ...INICIAL,
          id: 'v-2',
          desde: '2027-01',
          exameDia: 20,
          exameUltimoDia: false,
          criadoPor: 'Ana',
        },
        INICIAL,
      ],
    };
    editor({ podeEditar: false });
    expect(
      await screen.findByText(
        'Laudos assinados de 08 de um mês a 07 do seguinte; exames realizados de 21 do mês anterior a 20 do próprio mês',
      ),
    ).toBeInTheDocument();
  });
});

describe('EditorCorte (alterações e corridas)', () => {
  it('Cancelar sem mudar nada fecha direto', async () => {
    editor();
    await userEvent.click(await screen.findByRole('button', { name: 'Nova vigência' }));
    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nova vigência' })).toBeInTheDocument();
  });

  it('Cancelar com algo digitado pergunta antes de descartar e avisa quem está fora', async () => {
    const onAlterado = vi.fn();
    editor({ onAlterado });
    await userEvent.click(await screen.findByRole('button', { name: 'Nova vigência' }));
    await escolherOpcao('A partir de', '12/2026');
    expect(onAlterado).toHaveBeenLastCalledWith(true);

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(await screen.findByRole('alertdialog')).toHaveTextContent('Descartar as alterações?');
    await userEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(screen.getByRole('combobox', { name: 'A partir de' })).toHaveTextContent('12/2026');

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Descartar' }));
    expect(await screen.findByRole('button', { name: 'Nova vigência' })).toBeInTheDocument();
    expect(onAlterado).toHaveBeenLastCalledWith(false);
  });

  it('prévia que chega depois de mudar um campo é descartada', async () => {
    let responder: (v: unknown) => void = () => {};
    previa.mockReturnValue({
      unwrap: () =>
        new Promise((r) => {
          responder = r;
        }),
    } as never);
    editor();
    await userEvent.click(await screen.findByRole('button', { name: 'Nova vigência' }));
    await escolherOpcao('A partir de', '12/2026');
    await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    await escolherOpcao('Mês do corte (data do laudo)', 'No próprio mês');
    responder({ alterados: 120, movimentos: [{ de: '2026-11', para: '2026-12', laudos: 120 }] });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver prévia' })).toBeEnabled());
    expect(screen.queryByText('120 laudos mudam de competência.')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Salvar vigência' })).not.toBeInTheDocument();
    // Nem volta ao voltar o campo: a prévia que chegou atrasada não ficou guardada.
    await escolherOpcao('Mês do corte (data do laudo)', 'No mês seguinte');
    expect(screen.queryByText('120 laudos mudam de competência.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ver prévia' })).toBeInTheDocument();
  });

  it('sem corte padrão em vigor vindo da API, mostra o erro e não inventa um corte', async () => {
    porCliente = { padrao: [] };
    editor();
    expect(
      await screen.findByText('Não foi possível achar o corte padrão em vigor agora.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova vigência' })).not.toBeInTheDocument();
  });

  it('dentro de outra seção (aba do cliente), os títulos descem um nível', async () => {
    editor({ clienteId: 'c-1', nivelTitulos: 4 });
    expect(await screen.findByRole('heading', { level: 4, name: 'Em vigor' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 4, name: 'Histórico de vigências' }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Nova vigência' }));
    expect(screen.getByRole('heading', { level: 4, name: 'Nova vigência' })).toBeInTheDocument();
  });
});

describe('EditorCorte (cliente)', () => {
  it('sem vigência própria, diz que usa o padrão e qual é', async () => {
    editor({ clienteId: 'c-1', podeEditar: false });
    expect(await screen.findByText('Usa o corte padrão')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Laudos assinados de 08 de um mês a 07 do seguinte; exames realizados de 01 ao último dia do próprio mês',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Nenhuma vigência própria.')).toBeInTheDocument();
  });

  it('corte próprio em vigor e "usar o padrão" de volta, sem os campos do corte', async () => {
    porCliente['c-1'] = [
      {
        ...INICIAL,
        id: 'v-1',
        clienteId: 'c-1',
        desde: '2026-11',
        dia: 25,
        mes: 'proprio',
        consideraExame: false,
        criadoPor: 'Ana Financeiro',
      },
    ];
    editor({ clienteId: 'c-1' });
    expect(
      (
        await screen.findAllByText(
          'Laudos assinados de 26 do mês anterior a 25 do próprio mês; só a data do laudo conta',
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getByText(/Ana Financeiro/)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Nova vigência' }));
    await escolherOpcao('A partir de', '01/2027');
    expect(screen.queryByRole('option', { name: '11/2026' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('switch', { name: /Usar o corte padrão/ }));
    expect(screen.queryByRole('combobox', { name: /Dia do corte/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Ver prévia' }));
    expect(previa).toHaveBeenCalledWith({
      body: {
        clienteId: 'c-1',
        desde: '2027-01',
        usaPadrao: true,
        dia: null,
        ultimoDia: false,
        mes: null,
        consideraExame: null,
        exameDia: null,
        exameUltimoDia: false,
        exameMes: null,
      },
    });
  });

  it('unidade: avisa que o corte é o do cliente principal', async () => {
    editor({ clienteId: 'c-2', unidadeDe: 'PRN' });
    expect(
      await screen.findByText(/Os laudos desta unidade seguem o corte de PRN/),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nova vigência' })).not.toBeInTheDocument();
  });
});
