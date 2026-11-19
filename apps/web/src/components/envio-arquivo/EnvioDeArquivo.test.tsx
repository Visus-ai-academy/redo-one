import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EnvioDeArquivo } from './EnvioDeArquivo';

const xlsx = (nome = 'laudos.xlsx', bytes = 2048) =>
  new File([new Uint8Array(bytes)], nome, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });

type Enviar = (arquivo: File, onProgresso: (percentual: number) => void) => Promise<void>;

function montar(onEnviar: Enviar = vi.fn(async () => undefined)) {
  render(
    <EnvioDeArquivo
      extensao=".xlsx"
      tamanhoMaximoMb={1}
      rotuloEnviar="Enviar planilha"
      onEnviar={onEnviar}
    />,
  );
  return { onEnviar, entrada: screen.getByLabelText('Selecionar arquivo') };
}

describe('EnvioDeArquivo', () => {
  it('sem arquivo, a área toda seleciona o arquivo, sem botão à parte, e o envio fica desabilitado', async () => {
    const { entrada } = montar();
    expect(screen.getByText('Selecionar arquivo')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /escolher arquivo|trocar arquivo/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'Enviar planilha' })).toBeDisabled();

    const clique = vi.fn();
    entrada.addEventListener('click', clique);
    await userEvent.click(screen.getByText('Selecionar arquivo'));
    expect(clique).toHaveBeenCalled();
  });

  it('mostra o arquivo escolhido com o tamanho e envia, mostrando o progresso', async () => {
    let avisar: (p: number) => void = () => undefined;
    let terminar: () => void = () => undefined;
    const onEnviar = vi.fn(
      (_arquivo: File, onProgresso: (p: number) => void) =>
        new Promise<void>((resolve) => {
          avisar = onProgresso;
          terminar = resolve;
        }),
    );
    const { entrada } = montar(onEnviar);

    await userEvent.upload(entrada, xlsx());
    expect(screen.getByText('laudos.xlsx')).toBeInTheDocument();
    expect(screen.getByText('2 KB')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Enviar planilha' }));
    expect(onEnviar).toHaveBeenCalledWith(expect.any(File), expect.any(Function));
    avisar(40);
    expect(await screen.findByRole('progressbar', { name: 'Enviando a planilha' })).toHaveAttribute(
      'aria-valuenow',
      '40',
    );
    expect(screen.getByRole('button', { name: 'Enviando…' })).toBeDisabled();
    terminar();
  });

  it('recusa arquivo de outro formato ou grande demais, dizendo o porquê', async () => {
    const { entrada } = montar();

    await userEvent.upload(entrada, xlsx('laudos.csv'), { applyAccept: false });
    expect(screen.getByRole('alert')).toHaveTextContent('Escolha um arquivo .xlsx.');
    expect(screen.getByRole('button', { name: 'Enviar planilha' })).toBeDisabled();

    await userEvent.upload(entrada, xlsx('grande.xlsx', 2 * 1024 * 1024));
    expect(screen.getByRole('alert')).toHaveTextContent('O arquivo passa de 1 MB.');
  });

  it('se o envio falha, mostra o erro e mantém o arquivo para tentar de novo', async () => {
    const { entrada } = montar(
      vi.fn(async () => Promise.reject(new Error('A planilha não chegou.'))),
    );

    await userEvent.upload(entrada, xlsx());
    await userEvent.click(screen.getByRole('button', { name: 'Enviar planilha' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A planilha não chegou.');
    expect(screen.getByText('laudos.xlsx')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Enviar planilha' })).toBeEnabled();
  });
});
