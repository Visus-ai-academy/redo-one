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
  resolverMedico: (nome) => (nome === 'Dr. Ana Souza' ? 'm-ana' : null),
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
});
