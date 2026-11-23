import { describe, expect, it } from 'vitest';

import type { RetratoCatalogo } from './classificar-estudo';
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
    const { laudo, pendencias } = prepararLaudo(linha(), 'normal', cadastros, pseudonimo);

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
    expect(prepararLaudo(linha(), 'normal', cadastros, pseudonimo).laudo.pacienteChave).toBe(
      'hmac(codigo:123)',
    );
    expect(
      prepararLaudo(linha({ codigoPaciente: null }), 'normal', cadastros, pseudonimo).laudo
        .pacienteChave,
    ).toBe('hmac(nome:maria da silva)');
  });

  it('o hash do conteúdo muda quando um campo gravado muda', () => {
    const a = prepararLaudo(linha(), 'normal', cadastros, pseudonimo).laudo;
    const b = prepararLaudo(linha({ status: 'Reassinado' }), 'normal', cadastros, pseudonimo).laudo;
    expect(b.identidade).toBe(a.identidade);
    expect(b.hashConteudo).not.toBe(a.hashConteudo);
    expect(prepararLaudo(linha(), 'normal', cadastros, pseudonimo).laudo.hashConteudo).toBe(
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
    );
    expect(pendencias).toContainEqual({
      tipo: 'estudo',
      chave: 'rm espectroscopia',
      valor: 'RM Espectroscopia X2',
    });
  });

  it('devolve o que foi conferido, para resolver avisos que deixaram de faltar', () => {
    const { conferidos } = prepararLaudo(linha(), 'normal', cadastros, pseudonimo);
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
    );
    const semId = prepararLaudo(
      linha({ medico: 'Dr. Pedro Alves' }),
      'normal',
      cadastros,
      pseudonimo,
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
    const doUpload = prepararLaudo(linha(), 'normal', cadastros, pseudonimo).laudo;
    const daApi = prepararLaudo(
      linha({ medicoIdMobilemed: 45 }),
      'normal',
      cadastros,
      pseudonimo,
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
    ).laudo;
    const comId = prepararLaudo(
      linha({ medico: 'Dra. Ana Souza Prado', medicoIdMobilemed: 45 }),
      'normal',
      cadastros,
      pseudonimo,
    ).laudo;

    expect(soNome.medicoId).toBeNull();
    expect(comId.identidade).toBe(soNome.identidade);
    expect(comId.hashConteudo).not.toBe(soNome.hashConteudo);
  });
});
