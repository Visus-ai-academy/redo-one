import { describe, expect, it } from 'vitest';

import { converterLinha } from '../../domain/linha-planilha';
import { type ItemRelatorio, itemParaRegistro, itemRelatorio } from './esquemas-relatorio';

/** Cabeçalho do XLSX "Descritivo Especialidades" exportado pela tela (30 colunas). */
const CABECALHO_ESPECIALIDADES = [
  'EMPRESA',
  'NOME_PACIENTE',
  'CODIGO_PACIENTE',
  'ESTUDO_DESCRICAO',
  'ACCESSION_NUMBER',
  'MODALIDADE',
  'PRIORIDADE',
  'VALORES',
  'ESPECIALIDADE',
  'MEDICO',
  'DUPLICADO',
  'DATA_REALIZACAO',
  'HORA_REALIZACAO',
  'DATA_TRANSFERENCIA',
  'HORA_TRANSFERENCIA',
  'DATA_LAUDO',
  'HORA_LAUDO',
  'DATA_PRAZO',
  'HORA_PRAZO',
  'STATUS',
  'DATA_REASSINATURA',
  'HORA_REASSINATURA',
  'MEDICO_REASSINATURA',
  'SEGUNDA_ASSINATURA',
  'POSSUI_IMAGENS_CHAVE',
  'IMAGENS_CHAVES',
  'IMAGENS_CAPTURADAS',
  'CODIGO_INTERNO',
  'DIGITADOR',
  'COMPLEMENTAR',
];

/** Item como a MobileMed devolve (paciente fictício), já validado. */
const item = (campos: Record<string, unknown> = {}): ItemRelatorio =>
  itemRelatorio.parse({
    nome_fantasia: 'HPRIMAVERA',
    codigo_paciente: 'X1',
    nome_paciente: 'X',
    cpf_paciente: null,
    estudo_descricao: 'RX TORAX LEITO',
    descricao_subespecialidade: 'RX TORAX LEITO PA',
    pacs_accession_no: '22659770',
    valores: null,
    valor: '1.00',
    modalidade_id: 3,
    prioridade_id: 1,
    status_id: 1,
    is_complementar: 0,
    is_anterior: 0,
    is_duplicado: 0,
    medico: 'Dra. Ana',
    medico_primeiro_laudo: 'Dr. Antigo',
    especialidade: 'MEDICINA INTERNA',
    data_realizacao: '2026-10-05T11:00:00.000Z',
    data_criacao: '2026-10-05T11:30:00.000Z',
    data_laudo: '2026-10-06T13:15:42.512Z',
    primeira_data_laudo: '2026-10-06T12:00:00.000Z',
    sla_expiration_date: '2026-10-07T11:00:00.000Z',
    count_key_image: 0,
    count_captured_imgs: 0,
    cod_interno: null,
    digitador: null,
    segunda_assinatura_laudo: null,
    ...campos,
  });

describe('itemParaRegistro (laudos)', () => {
  it('traz exatamente as colunas da planilha, com os tipos que o leitor do XLSX entrega', () => {
    const r = itemParaRegistro(item(), 'laudos');

    expect(Object.keys(r).sort()).toEqual([...CABECALHO_ESPECIALIDADES].sort());
    // Na planilha real tudo é texto, menos IMAGENS_CHAVES e IMAGENS_CAPTURADAS.
    for (const [coluna, valor] of Object.entries(r)) {
      if (valor === null) continue;
      expect([coluna, typeof valor]).toEqual([
        coluna,
        coluna.startsWith('IMAGENS_') ? 'number' : 'string',
      ]);
    }
    expect(r).toMatchObject({
      MODALIDADE: 'CR',
      PRIORIDADE: 'Rotina',
      VALORES: '1.00',
      STATUS: 'Assinado',
      DUPLICADO: 'Não',
      POSSUI_IMAGENS_CHAVE: 'NAO',
      // Assinado: o laudo é o data_laudo, com o médico dele; truncado no segundo, em Brasília.
      DATA_LAUDO: '06/10/2026',
      HORA_LAUDO: '10:15:42',
      MEDICO: 'Dra. Ana',
      DATA_TRANSFERENCIA: '05/10/2026',
      HORA_TRANSFERENCIA: '08:30:00',
      DATA_PRAZO: '07/10/2026',
      HORA_PRAZO: '08:00:00',
      DATA_REASSINATURA: '',
      MEDICO_REASSINATURA: null,
      // O relatório de especialidades usa o nome do estudo, não o da subespecialidade.
      ESTUDO_DESCRICAO: 'RX TORAX LEITO',
    });
  });

  it('reassinado: o laudo e o médico são os primeiros; a reassinatura é o data_laudo', () => {
    const r = itemParaRegistro(item({ status_id: 5 }), 'laudos');

    expect(r).toMatchObject({
      STATUS: 'Reassinado',
      DATA_LAUDO: '06/10/2026',
      HORA_LAUDO: '09:00:00',
      MEDICO: 'Dr. Antigo',
      DATA_REASSINATURA: '06/10/2026',
      HORA_REASSINATURA: '10:15:42',
      MEDICO_REASSINATURA: 'Dra. Ana',
    });
    expect(converterLinha(r)).toMatchObject({
      status: 'Reassinado',
      dataLaudo: new Date('2026-10-06T12:00:00.000Z'),
      dataReassinatura: new Date('2026-10-06T13:15:42.000Z'),
    });
  });

  it('não assinado: o laudo vem de primeira_data_laudo', () => {
    expect(itemParaRegistro(item({ status_id: 3 }), 'laudos')).toMatchObject({
      STATUS: 'Não Assinado',
      HORA_LAUDO: '09:00:00',
      MEDICO: 'Dr. Antigo',
    });
  });

  it('COMPLEMENTAR recebe is_anterior, como a planilha da tela; DUPLICADO aceita 0/1', () => {
    const r = itemParaRegistro(
      item({ is_anterior: 1, is_complementar: 0, is_duplicado: 1 }),
      'laudos',
    );
    expect(r).toMatchObject({ COMPLEMENTAR: 'Sim', DUPLICADO: 'Sim' });
  });

  it('valor vazio vira 0; imagens marcam SIM; modalidade fora da tabela fica vazia', () => {
    const r = itemParaRegistro(
      item({ valor: null, count_key_image: 2, modalidade_id: 99 }),
      'laudos',
    );
    expect(r).toMatchObject({
      VALORES: 0,
      POSSUI_IMAGENS_CHAVE: 'SIM',
      IMAGENS_CHAVES: 2,
      MODALIDADE: null,
    });
    expect(() => converterLinha(r)).toThrow('MODALIDADE: obrigatório');
  });

  it('a linha convertida dá o mesmo laudo que a planilha equivalente', () => {
    const r = itemParaRegistro(item(), 'laudos');
    const daPlanilha = {
      ...r,
      // Como o leitor do XLSX entrega uma planilha exportada pela tela.
      DATA_REASSINATURA: null,
      HORA_REASSINATURA: null,
    };
    expect(converterLinha(r)).toEqual(converterLinha(daPlanilha));
  });
});

describe('itemParaRegistro (compartilhamento)', () => {
  it('a unidade de destino é a empresa; estudo da subespecialidade; valores com 2 casas', () => {
    const r = itemParaRegistro(
      item({
        is_compartilhamento_enviado_para: 'CRD_APOIO',
        nome_fantasia: 'CRD MD',
        valores: 1,
        is_complementar: 1,
        is_anterior: 0,
      }),
      'compartilhamento',
    );

    expect(r).toMatchObject({
      UNIDADE_ORIGEM: 'CRD MD',
      COMPARTILHAMENTO_ENVIADO_PARA: 'CRD_APOIO',
      EMPRESA: 'CRD_APOIO',
      ESTUDO_DESCRICAO: 'RX TORAX LEITO PA',
      VALORES: '1.00',
      COMPLEMENTO: 'Sim',
      COMPLEMENTAR: 'Sim',
      ANTERIOR: 'Não',
    });
    expect(r).not.toHaveProperty('ESPECIALIDADE');
    expect(r).not.toHaveProperty('IDENTIDADE');
    expect(r).not.toHaveProperty('CONVENIO');
    expect(converterLinha(r)).toMatchObject({ empresa: 'CRD_APOIO', especialidade: '' });
  });
});
