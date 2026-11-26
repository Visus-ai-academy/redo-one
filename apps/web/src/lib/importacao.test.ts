import { describe, expect, it, vi } from 'vitest';

import { importacoesControllerConfirmarEnvio } from '../gen/clients/importacoesControllerConfirmarEnvio';
import { importacoesControllerPrepararEnvio } from '../gen/clients/importacoesControllerPrepararEnvio';
import { enviarArquivo } from './envio-arquivo';
import {
  atualizarEnquantoRoda,
  enviarPlanilha,
  origemDaImportacao,
  periodoDosLaudos,
  situacaoDaImportacao,
  TIPO_XLSX,
  terminadas,
  textoDoFim,
} from './importacao';

vi.mock('../gen/clients/importacoesControllerPrepararEnvio');
vi.mock('../gen/clients/importacoesControllerConfirmarEnvio');
vi.mock('./envio-arquivo');

describe('situacaoDaImportacao', () => {
  it('dá o rótulo e o tom de cada status', () => {
    expect(situacaoDaImportacao('na_fila')).toEqual({ texto: 'Na fila', tom: 'info' });
    expect(situacaoDaImportacao('processando')).toEqual({ texto: 'Processando', tom: 'info' });
    expect(situacaoDaImportacao('concluida')).toEqual({ texto: 'Concluída', tom: 'sucesso' });
    expect(situacaoDaImportacao('recusada')).toEqual({ texto: 'Recusada', tom: 'atencao' });
    expect(situacaoDaImportacao('erro')).toEqual({ texto: 'Erro', tom: 'erro' });
  });
});

describe('origemDaImportacao', () => {
  it('o nome da planilha no upload; o relatório na MobileMed; a carga do dashboards-one', () => {
    expect(
      origemDaImportacao({
        origem: 'upload_manual',
        nomeArquivo: 'laudos.xlsx',
        formato: 'laudos',
      }),
    ).toBe('laudos.xlsx');
    expect(origemDaImportacao({ origem: 'mobilemed', nomeArquivo: null, formato: 'laudos' })).toBe(
      'MobileMed: laudos',
    );
    expect(
      origemDaImportacao({ origem: 'mobilemed', nomeArquivo: null, formato: 'compartilhamento' }),
    ).toBe('MobileMed: compartilhamento');
    expect(
      origemDaImportacao({ origem: 'carga_legado', nomeArquivo: null, formato: 'laudos' }),
    ).toBe('Carga do dashboards-one');
  });
});

describe('periodoDosLaudos', () => {
  it('um dia, um mês ou dois anos', () => {
    expect(periodoDosLaudos('2026-10-06', '2026-10-06')).toBe('06/10/2026');
    expect(periodoDosLaudos('2026-10-01', '2026-10-31')).toBe('01/10 a 31/10/2026');
    expect(periodoDosLaudos('2026-12-20', '2027-01-05')).toBe('20/12/2026 a 05/01/2027');
    expect(periodoDosLaudos(null, null)).toBeNull();
  });
});

describe('atualizarEnquantoRoda', () => {
  it('atualiza a cada 30 s só enquanto alguma importação está na fila ou processando', () => {
    expect(atualizarEnquantoRoda([{ status: 'concluida' }, { status: 'na_fila' }])).toBe(30_000);
    expect(atualizarEnquantoRoda([{ status: 'concluida' }, { status: 'erro' }])).toBe(false);
  });
});

describe('enviarPlanilha', () => {
  it('pede a URL, envia ao storage e confirma, devolvendo a importação', async () => {
    vi.mocked(importacoesControllerPrepararEnvio).mockReturnValue({
      unwrap: async () => ({ arquivoId: 'a1', url: 'https://storage/x', expiraEm: '' }),
    } as never);
    vi.mocked(importacoesControllerConfirmarEnvio).mockReturnValue({
      unwrap: async () => ({ id: 'i1' }),
    } as never);
    vi.mocked(enviarArquivo).mockResolvedValue();
    const arquivo = new File(['abc'], 'laudos.xlsx', { type: '' });
    const progresso = vi.fn();

    expect(await enviarPlanilha(arquivo, progresso)).toBe('i1');

    expect(importacoesControllerPrepararEnvio).toHaveBeenCalledWith({
      body: { nomeArquivo: 'laudos.xlsx', tamanhoBytes: 3, tipoConteudo: TIPO_XLSX },
    });
    expect(enviarArquivo).toHaveBeenCalledWith('https://storage/x', arquivo, TIPO_XLSX, progresso);
    expect(importacoesControllerConfirmarEnvio).toHaveBeenCalledWith({ body: { arquivoId: 'a1' } });
  });
});

describe('terminadas', () => {
  it('devolve as que rodavam na consulta anterior e agora terminaram', () => {
    const antes = [
      { id: 'a', status: 'processando' as const },
      { id: 'b', status: 'na_fila' as const },
      { id: 'c', status: 'concluida' as const },
    ];
    const agora = [
      { id: 'a', status: 'concluida' as const },
      { id: 'b', status: 'processando' as const },
      { id: 'c', status: 'concluida' as const },
      { id: 'd', status: 'erro' as const },
    ];

    expect(terminadas(antes, agora).map((i) => i.id)).toEqual(['a']);
  });

  it('sem consulta anterior, nada terminou', () => {
    expect(terminadas(undefined, [{ id: 'a', status: 'concluida' as const }])).toEqual([]);
  });
});

describe('textoDoFim', () => {
  it('diz como a importação terminou, com os números em pt-BR', () => {
    expect(textoDoFim({ status: 'concluida', inseridos: 1234, atualizados: 5 })).toBe(
      'Importação concluída: 1.234 laudos novos e 5 alterados.',
    );
    expect(textoDoFim({ status: 'concluida', inseridos: 1, atualizados: 0 })).toBe(
      'Importação concluída: 1 laudo novo e nenhum alterado.',
    );
    expect(textoDoFim({ status: 'recusada', inseridos: null, atualizados: null })).toBe(
      'Importação recusada. Abra a importação para ver o motivo.',
    );
    expect(textoDoFim({ status: 'erro', inseridos: null, atualizados: null })).toBe(
      'A importação falhou. Abra a importação para ver o erro.',
    );
  });
});
