import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ImportacaoDetalheDto } from '../../gen/types/ImportacaoDetalheDto';
import { DetalheImportacao } from './DetalheImportacao';

const base: ImportacaoDetalheDto = {
  id: 'i1',
  status: 'concluida',
  origem: 'upload_manual',
  formato: 'laudos',
  nomeArquivo: 'laudos_outubro.xlsx',
  enviadaPor: { id: 'u1', nome: 'Maria Souza' },
  criadaEm: '2026-11-16T12:00:00Z',
  iniciadaEm: '2026-11-16T12:00:05Z',
  concluidaEm: '2026-11-16T12:01:00Z',
  janelaInicio: '2026-10-01',
  janelaFim: '2026-10-31',
  linhasArquivo: 40_120,
  inseridos: 1_200,
  atualizados: 30,
  inalterados: 38_880,
  removidos: 4,
  invalidas: 6,
  ignoradasCompetenciaFechada: 0,
  mensagem: null,
  errosLinhas: Array.from({ length: 6 }, (_, i) => ({
    linha: i + 2,
    mensagem: `STATUS: obrigatório ${i}`,
  })),
};

describe('DetalheImportacao', () => {
  it('mostra o período, o arquivo e o resultado em números', () => {
    render(<DetalheImportacao importacao={base} />);

    expect(screen.getByText('01/10 a 31/10/2026')).toBeInTheDocument();
    expect(screen.getByText('Maria Souza')).toBeInTheDocument();
    const resultado = screen.getByRole('region', { name: 'Resultado' });
    expect(within(resultado).getByText('Laudos novos').nextSibling).toHaveTextContent('1.200');
    expect(within(resultado).getByText('Linhas na planilha').nextSibling).toHaveTextContent(
      '40.120',
    );
    expect(within(resultado).getByText('Removidos da janela').nextSibling).toHaveTextContent('4');
  });

  it('lista as linhas que não entraram, 5 por página', async () => {
    render(<DetalheImportacao importacao={base} />);

    const lista = screen.getByRole('region', { name: 'Linhas que não entraram' });
    expect(within(lista).getAllByRole('listitem')).toHaveLength(5);
    expect(within(lista).getByText('Linha 2')).toBeInTheDocument();
    await userEvent.click(within(lista).getByRole('button', { name: 'Próxima página' }));
    expect(within(lista).getByText('Linha 7')).toBeInTheDocument();
  });

  it('explica a recusa e o que fazer', () => {
    render(
      <DetalheImportacao
        importacao={{
          ...base,
          status: 'recusada',
          mensagem:
            'O arquivo removeria 900 laudos da janela com só 10 linhas: parece incompleto. Nada foi alterado.',
        }}
      />,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('parece incompleto');
  });

  it('enquanto roda, avisa que a tela atualiza sozinha e não mostra resultado', () => {
    render(<DetalheImportacao importacao={{ ...base, status: 'processando', inseridos: null }} />);
    expect(screen.getByRole('status')).toHaveTextContent('Processando a planilha');
    expect(screen.queryByRole('region', { name: 'Resultado' })).not.toBeInTheDocument();
  });

  it('baixar a planilha só aparece para quem pode, e chama o download', async () => {
    const onBaixar = vi.fn(async () => undefined);
    const { rerender } = render(<DetalheImportacao importacao={base} />);
    expect(screen.queryByRole('button', { name: 'Baixar planilha' })).not.toBeInTheDocument();

    rerender(<DetalheImportacao importacao={base} onBaixar={onBaixar} />);
    await userEvent.click(screen.getByRole('button', { name: 'Baixar planilha' }));
    expect(onBaixar).toHaveBeenCalled();
  });

  it('importação da MobileMed: mostra o relatório no lugar do arquivo e não oferece download', () => {
    render(
      <DetalheImportacao
        importacao={{ ...base, origem: 'mobilemed', nomeArquivo: null, enviadaPor: null }}
        onBaixar={vi.fn()}
      />,
    );

    expect(screen.getByText('Relatório da MobileMed')).toBeInTheDocument();
    expect(screen.queryByText('Arquivo')).not.toBeInTheDocument();
    expect(screen.getByText('Agendamento automático')).toBeInTheDocument();
    expect(screen.getByText('Linhas no relatório')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Baixar planilha' })).not.toBeInTheDocument();
  });
});
