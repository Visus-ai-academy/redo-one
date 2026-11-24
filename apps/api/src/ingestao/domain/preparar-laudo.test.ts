import { describe, expect, it } from 'vitest';
import type { RetratoCatalogo } from './classificar-estudo';
import { CORTE_PADRAO_INICIAL, type TabelaCortes } from './competencia';
import type { LinhaLaudo } from './linha-planilha';
import { type CadastrosIngestao, prepararLaudo } from './preparar-laudo';

const catalogo: RetratoCatalogo = {
  exames: new Map([
    [
      'tc torax',
      { id: 'ex-torax', modalidadeId: 'mod-ct', especialidadeId: 'esp-mi', categoriaId: null },
    ],
  ]),
  valoresForaDoPadrao: new Map(),
  quebras: new Map(),
  modalidades: new Map([['ct', 'mod-ct']]),
  especialidades: new Map([['medicina interna', 'esp-mi']]),
  especialidadesInvalidas: new Set(),
};

const cadastros: CadastrosIngestao = {
  catalogo,
  prioridades: new Map([['rotina', 'pri-rotina']]),
  resolverCliente: (empresa) => (empresa === 'CLINICA X' ? 'c-x' : null),
  // Ana tem a conta 45 na MobileMed; Bia, a 46.
  resolverMedico: (nome, idMobilemed) =>
    ({ 45: 'm-ana', 46: 'm-bia' })[idMobilemed ?? 0] ?? (nome === 'Dr. Ana Souza' ? 'm-ana' : null),
};

const pseudonimo = (texto: string) => `hmac(${texto})`;
const cortes: TabelaCortes = { padrao: [CORTE_PADRAO_INICIAL], porCliente: new Map() };

const linha = (campos: Partial<LinhaLaudo> = {}): LinhaLaudo => ({
  empresa: 'CLINICA X',
  nomePaciente: 'Maria da Silva',
  codigoPaciente: '00123',
  estudo: 'TC TORAX',
  accessionNumber: 'A1',
  modalidade: 'CT',
  prioridade: 'Rotina',
  valores: 2,
  especialidade: 'MEDICINA INTERNA',
  medico: 'Dr. Ana Souza',
  duplicado: false,
  complementar: false,
  status: 'Assinado',
  dataRealizacao: new Date('2026-10-05T11:00:00Z'),
  dataTransferencia: null,
  dataLaudo: new Date('2026-10-06T02:30:00Z'),
  dataPrazo: null,
  dataReassinatura: null,
  medicoReassinatura: null,
  medicoIdMobilemed: null,
  medicoReassinaturaIdMobilemed: null,
  ...campos,
});

describe('prepararLaudo', () => {
  it('resolve os cadastros e calcula volume, dia, competência e identidade', () => {
    const { laudo, pendencias } = prepararLaudo(linha(), 'normal', cadastros, pseudonimo, cortes);

    expect(laudo).toMatchObject({
      origem: 'normal',
      empresaOrigem: 'CLINICA X',
      clienteId: 'c-x',
      exameId: 'ex-torax',
      modalidadeId: 'mod-ct',
      especialidadeId: 'esp-mi',
      prioridadeId: 'pri-rotina',
      medicoId: 'm-ana',
      volume: 2,
      // 06/10 02:30 UTC = 05/10 23:30 em Brasília
      diaLaudo: '2026-10-05',
      competencia: '2026-10',
      pecas: [],
    });
    expect(laudo.identidade).toMatch(/^[0-9a-f]{64}$/);
    expect(pendencias).toEqual([]);
  });

  it('o paciente vira pseudônimo do código sem zeros à esquerda; sem código, do nome', () => {
    expect(
      prepararLaudo(linha(), 'normal', cadastros, pseudonimo, cortes).laudo.pacienteChave,
    ).toBe('hmac(codigo:123)');
    expect(
      prepararLaudo(linha({ codigoPaciente: null }), 'normal', cadastros, pseudonimo, cortes).laudo
        .pacienteChave,
    ).toBe('hmac(nome:maria da silva)');
  });

  it('o paciente vai à parte, como chegou, com a conferência em HMAC e fora do hash do conteúdo', () => {
    const { laudo } = prepararLaudo(linha(), 'normal', cadastros, pseudonimo, cortes);
    expect(laudo.paciente).toEqual({
      nome: 'Maria da Silva',
      codigo: '00123',
      conferencia: 'hmac(paciente:["Maria da Silva","00123"])',
    });

    // Só o nome mudou (grafia corrigida na MobileMed): o laudo é o mesmo, a conferência não.
    const corrigido = prepararLaudo(
      linha({ nomePaciente: 'Maria da Silva Souza' }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    ).laudo;
    expect(corrigido.identidade).toBe(laudo.identidade);
    expect(corrigido.hashConteudo).toBe(laudo.hashConteudo);
    expect(corrigido.paciente?.conferencia).not.toBe(laudo.paciente?.conferencia);
  });

  it('linha sem nome nem código não tem paciente para gravar', () => {
    const { laudo } = prepararLaudo(
      linha({ nomePaciente: null, codigoPaciente: null }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    );
    expect(laudo.paciente).toBeNull();
  });

  it('o hash do conteúdo muda quando um campo gravado muda', () => {
    const a = prepararLaudo(linha(), 'normal', cadastros, pseudonimo, cortes).laudo;
    const b = prepararLaudo(
      linha({ status: 'Reassinado' }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    ).laudo;
    expect(b.identidade).toBe(a.identidade);
    expect(b.hashConteudo).not.toBe(a.hashConteudo);
    expect(prepararLaudo(linha(), 'normal', cadastros, pseudonimo, cortes).laudo.hashConteudo).toBe(
      a.hashConteudo,
    );
  });

  it('cadastros desconhecidos viram pendências com a chave normalizada do aviso', () => {
    const { laudo, pendencias } = prepararLaudo(
      linha({
        empresa: 'Clínica Nova',
        medico: 'Dr. Pedro Alves',
        prioridade: 'Eletiva',
        medicoReassinatura: 'Dra. Bia Lima',
      }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    );

    expect(laudo.clienteId).toBeNull();
    expect(pendencias).toEqual(
      expect.arrayContaining([
        { tipo: 'cliente', chave: 'clinica nova', valor: 'Clínica Nova' },
        { tipo: 'medico', chave: 'pedro alves', valor: 'Dr. Pedro Alves' },
        { tipo: 'medico', chave: 'bia lima', valor: 'Dra. Bia Lima' },
        { tipo: 'prioridade', chave: 'eletiva', valor: 'Eletiva' },
      ]),
    );
  });

  it('a pendência de estudo usa a chave do estudo sem o sufixo X', () => {
    const { pendencias } = prepararLaudo(
      linha({ estudo: 'RM Espectroscopia X2' }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    );
    expect(pendencias).toContainEqual({
      tipo: 'estudo',
      chave: 'rm espectroscopia',
      valor: 'RM Espectroscopia X2',
    });
  });

  it('devolve o que foi conferido, para resolver avisos que deixaram de faltar', () => {
    const { conferidos } = prepararLaudo(linha(), 'normal', cadastros, pseudonimo, cortes);
    expect(conferidos).toEqual(
      expect.arrayContaining([
        { tipo: 'cliente', chave: 'clinica x' },
        { tipo: 'medico', chave: 'ana souza' },
        { tipo: 'estudo', chave: 'tc torax' },
        { tipo: 'prioridade', chave: 'rotina' },
      ]),
    );
  });

  it('pelo id da conta MobileMed acha o médico cujo nome chegou diferente do cadastro', () => {
    const { laudo, pendencias, conferidos } = prepararLaudo(
      linha({ medico: 'Dra. Ana Souza Prado', medicoIdMobilemed: 45 }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    );

    expect(laudo).toMatchObject({
      medicoOrigem: 'Dra. Ana Souza Prado',
      medicoId: 'm-ana',
      medicoIdMobilemed: 45,
    });
    expect(pendencias).toEqual([]);
    // Resolve o aviso que o nome tinha aberto quando só o nome contava.
    expect(conferidos).toContainEqual({ tipo: 'medico', chave: 'ana souza prado' });
  });

  it('a reassinatura também é resolvida pelo id primeiro', () => {
    const { laudo } = prepararLaudo(
      linha({
        status: 'Reassinado',
        medicoReassinatura: 'Dra. Bia L.',
        medicoReassinaturaIdMobilemed: 46,
      }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    );
    expect(laudo).toMatchObject({
      medicoReassinaturaId: 'm-bia',
      medicoReassinaturaIdMobilemed: 46,
    });
  });

  it('id desconhecido cai no nome, como sem id', () => {
    const { laudo, pendencias } = prepararLaudo(
      linha({ medicoIdMobilemed: 999 }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    );
    expect(laudo).toMatchObject({ medicoId: 'm-ana', medicoIdMobilemed: 999 });
    expect(pendencias).toEqual([]);
  });

  it('o aviso do médico pendente diz quando o id da conta veio e não está no cadastro', () => {
    const comId = prepararLaudo(
      linha({ medico: 'Dr. Pedro Alves', medicoIdMobilemed: 999 }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    );
    const semId = prepararLaudo(
      linha({ medico: 'Dr. Pedro Alves' }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    );

    // A chave continua a do nome: o mesmo médico pelo upload e pela API é um aviso só.
    expect(comId.pendencias).toEqual([
      {
        tipo: 'medico',
        chave: 'pedro alves',
        valor: 'Dr. Pedro Alves (ID MobileMed 999 sem cadastro)',
      },
    ]);
    expect(semId.pendencias).toEqual([
      { tipo: 'medico', chave: 'pedro alves', valor: 'Dr. Pedro Alves' },
    ]);
  });

  it('o id da conta não muda a identidade nem o hash quando o médico é o mesmo (upload = API)', () => {
    const doUpload = prepararLaudo(linha(), 'normal', cadastros, pseudonimo, cortes).laudo;
    const daApi = prepararLaudo(
      linha({ medicoIdMobilemed: 45 }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    ).laudo;

    expect(daApi.identidade).toBe(doUpload.identidade);
    expect(daApi.hashConteudo).toBe(doUpload.hashConteudo);
  });

  it('o laudo que o id liga a um médico muda de hash, para a reimportação gravar o médico', () => {
    const soNome = prepararLaudo(
      linha({ medico: 'Dra. Ana Souza Prado' }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    ).laudo;
    const comId = prepararLaudo(
      linha({ medico: 'Dra. Ana Souza Prado', medicoIdMobilemed: 45 }),
      'normal',
      cadastros,
      pseudonimo,
      cortes,
    ).laudo;

    expect(soNome.medicoId).toBeNull();
    expect(comId.identidade).toBe(soNome.identidade);
    expect(comId.hashConteudo).not.toBe(soNome.hashConteudo);
  });

  it('a competência vem do corte configurado do cliente', () => {
    const comCorte: TabelaCortes = {
      padrao: [CORTE_PADRAO_INICIAL],
      porCliente: new Map([
        ['c-x', [{ desde: '2026-11', corte: { dia: 25, mes: 'proprio', consideraExame: false } }]],
      ]),
    };
    const dados = {
      dataRealizacao: new Date('2026-11-20T13:00:00Z'),
      dataLaudo: new Date('2026-11-27T13:00:00Z'),
    };

    expect(
      prepararLaudo(linha(dados), 'normal', cadastros, pseudonimo, cortes).laudo.competencia,
    ).toBe('2026-11');
    expect(
      prepararLaudo(linha(dados), 'normal', cadastros, pseudonimo, comCorte).laudo.competencia,
    ).toBe('2026-12');
  });

  it('sem cliente resolvido usa o corte padrão', () => {
    const comCorte: TabelaCortes = {
      padrao: [CORTE_PADRAO_INICIAL],
      porCliente: new Map([
        ['c-x', [{ desde: '2026-11', corte: { dia: 25, mes: 'proprio', consideraExame: false } }]],
      ]),
    };
    const { laudo } = prepararLaudo(
      linha({
        empresa: 'DESCONHECIDA',
        dataRealizacao: new Date('2026-11-20T13:00:00Z'),
        dataLaudo: new Date('2026-11-27T13:00:00Z'),
      }),
      'normal',
      cadastros,
      pseudonimo,
      comCorte,
    );

    expect(laudo.clienteId).toBeNull();
    expect(laudo.competencia).toBe('2026-11');
  });
});
