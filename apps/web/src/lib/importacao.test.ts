import { describe, expect, it, vi } from 'vitest';

import { importacoesControllerConfirmarEnvio } from '../gen/clients/importacoesControllerConfirmarEnvio';
import { importacoesControllerPrepararEnvio } from '../gen/clients/importacoesControllerPrepararEnvio';
import { enviarArquivo } from './envio-arquivo';
import {
  atualizarEnquantoRoda,
  enviarPlanilha,
  periodoDosLaudos,
  situacaoDaImportacao,
  TIPO_XLSX,
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
