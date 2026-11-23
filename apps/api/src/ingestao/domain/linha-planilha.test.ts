import { describe, expect, it } from 'vitest';

import type { Celula } from './celulas';
import { converterLinha } from './linha-planilha';

const registro = (campos: Record<string, Celula> = {}): Record<string, Celula> => ({
  EMPRESA: ' CLINICA X ',
  NOME_PACIENTE: 'MARIA DA SILVA',
  CODIGO_PACIENTE: '00123',
  ESTUDO_DESCRICAO: 'TC TORAX X1',
  ACCESSION_NUMBER: 'A1',
  MODALIDADE: 'CT',
  PRIORIDADE: 'Rotina',
  VALORES: 1,
  ESPECIALIDADE: 'MEDICINA INTERNA',
  MEDICO: 'Dr. Ana Souza',
  DUPLICADO: 'Não',
  DATA_REALIZACAO: '05/10/2026',
  HORA_REALIZACAO: '08:00',
  DATA_TRANSFERENCIA: '05/10/2026',
  HORA_TRANSFERENCIA: '08:10',
  DATA_LAUDO: '06/10/2026',
  HORA_LAUDO: '10:00',
  DATA_PRAZO: '06/10/2026',
  HORA_PRAZO: '08:00',
  STATUS: 'Assinado',
  DATA_REASSINATURA: null,
  HORA_REASSINATURA: null,
  MEDICO_REASSINATURA: null,
  COMPLEMENTAR: 'Não',
  ...campos,
});

describe('converterLinha', () => {
  it('converte a linha da MobileMed, com as datas de Brasília em UTC', () => {
    expect(converterLinha(registro())).toEqual({
      empresa: 'CLINICA X',
      nomePaciente: 'MARIA DA SILVA',
      codigoPaciente: '00123',
      estudo: 'TC TORAX X1',
      accessionNumber: 'A1',
      modalidade: 'CT',
      prioridade: 'Rotina',
      valores: 1,
      especialidade: 'MEDICINA INTERNA',
      medico: 'Dr. Ana Souza',
      duplicado: false,
      complementar: false,
      status: 'Assinado',
      dataRealizacao: new Date('2026-10-05T11:00:00Z'),
      dataTransferencia: new Date('2026-10-05T11:10:00Z'),
      dataLaudo: new Date('2026-10-06T13:00:00Z'),
      dataPrazo: new Date('2026-10-06T11:00:00Z'),
      dataReassinatura: null,
      medicoReassinatura: null,
      // A planilha do upload não traz o id da conta MobileMed: só a API.
      medicoIdMobilemed: null,
      medicoReassinaturaIdMobilemed: null,
    });
  });

  it('lê o id da conta MobileMed dos médicos quando a linha traz (importação pela API)', () => {
    const linha = converterLinha(registro({ MEDICO_ID: 45, MEDICO_REASSINATURA_ID: '46' }));
    expect(linha).toMatchObject({ medicoIdMobilemed: 45, medicoReassinaturaIdMobilemed: 46 });
  });

  it('id da conta que não é inteiro positivo vira null, sem recusar a linha', () => {
    for (const MEDICO_ID of [0, '', 'abc', -1, 2.5, null, undefined]) {
      expect(converterLinha(registro({ MEDICO_ID })).medicoIdMobilemed).toBeNull();
    }
  });

  it('especialidade e médico podem faltar (a planilha de compartilhamento não traz especialidade)', () => {
    const linha = converterLinha(registro({ ESPECIALIDADE: undefined, MEDICO: null }));
    expect(linha.especialidade).toBe('');
    expect(linha.medico).toBeNull();
  });

  it.each([
    'EMPRESA',
    'ESTUDO_DESCRICAO',
    'MODALIDADE',
    'PRIORIDADE',
    'STATUS',
    'DATA_REALIZACAO',
    'DATA_LAUDO',
  ])('recusa a linha sem %s', (coluna) => {
    expect(() => converterLinha(registro({ [coluna]: '' }))).toThrow(`${coluna}: obrigatório`);
  });

  it('diz a coluna da data inválida', () => {
    expect(() => converterLinha(registro({ DATA_LAUDO: '31/02/2026' }))).toThrow(
      'DATA_LAUDO: data inválida',
    );
  });

  it('diz a coluna do número inválido', () => {
    expect(() => converterLinha(registro({ VALORES: 'dois' }))).toThrow('VALORES: número inválido');
  });
});
