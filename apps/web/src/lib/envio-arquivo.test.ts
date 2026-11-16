import { afterEach, describe, expect, it, vi } from 'vitest';

import { enviarArquivo } from './envio-arquivo';

type Ouvinte = (evento: { loaded: number; total: number; lengthComputable: boolean }) => void;

class XhrFalso {
  static ultimo: XhrFalso;
  metodo = '';
  url = '';
  cabecalhos: Record<string, string> = {};
  corpo: unknown;
  status = 0;
  onload?: () => void;
  onerror?: () => void;
  upload = {
    onprogress: undefined as Ouvinte | undefined,
  };
  constructor() {
    XhrFalso.ultimo = this;
  }
  open(metodo: string, url: string) {
    this.metodo = metodo;
    this.url = url;
  }
  setRequestHeader(nome: string, valor: string) {
    this.cabecalhos[nome] = valor;
  }
  send(corpo: unknown) {
    this.corpo = corpo;
  }
}

describe('enviarArquivo', () => {
  afterEach(() => vi.unstubAllGlobals());

  const arquivo = new File(['abc'], 'laudos.xlsx', { type: 'application/x-teste' });

  it('faz PUT na URL assinada com o tipo assinado e avisa o progresso', async () => {
    vi.stubGlobal('XMLHttpRequest', XhrFalso);
    const progresso = vi.fn();

    const envio = enviarArquivo(
      'https://storage/url',
      arquivo,
      'application/x-assinado',
      progresso,
    );
    const xhr = XhrFalso.ultimo;
    xhr.upload.onprogress?.({ loaded: 1, total: 4, lengthComputable: true });
    xhr.status = 200;
    xhr.onload?.();
    await envio;

    expect(xhr.metodo).toBe('PUT');
    expect(xhr.url).toBe('https://storage/url');
    expect(xhr.cabecalhos).toEqual({ 'Content-Type': 'application/x-assinado' });
    expect(xhr.corpo).toBe(arquivo);
    expect(progresso).toHaveBeenCalledWith(25);
  });

  it('falha quando o storage recusa ou a rede cai', async () => {
    vi.stubGlobal('XMLHttpRequest', XhrFalso);

    const recusado = enviarArquivo('u', arquivo, 'x', () => undefined);
    XhrFalso.ultimo.status = 403;
    XhrFalso.ultimo.onload?.();
    await expect(recusado).rejects.toThrow('O envio da planilha falhou. Tente de novo.');

    const semRede = enviarArquivo('u', arquivo, 'x', () => undefined);
    XhrFalso.ultimo.onerror?.();
    await expect(semRede).rejects.toThrow('O envio da planilha falhou. Tente de novo.');
  });
});
