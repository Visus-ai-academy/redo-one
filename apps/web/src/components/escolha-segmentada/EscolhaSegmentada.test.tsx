import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EscolhaSegmentada } from './EscolhaSegmentada';

describe('EscolhaSegmentada', () => {
  const opcoes = [
    { valor: 'semana', rotulo: 'Semana' },
    { valor: 'mes', rotulo: 'Mês' },
  ];

  it('marca a atual e avisa a troca', async () => {
    const onMudar = vi.fn();
    render(
      <EscolhaSegmentada aria-label="Modo" opcoes={opcoes} valor="semana" onMudar={onMudar} />,
    );
    expect(screen.getByRole('button', { name: 'Semana' })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Mês' }));
    expect(onMudar).toHaveBeenCalledWith('mes');
  });

  it('clicar na atual não deixa nada desmarcado', async () => {
    const onMudar = vi.fn();
    render(
      <EscolhaSegmentada aria-label="Modo" opcoes={opcoes} valor="semana" onMudar={onMudar} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Semana' }));
    expect(onMudar).not.toHaveBeenCalled();
  });

  it('aceita uma opção de valor vazio ("Não informado")', async () => {
    const onMudar = vi.fn();
    const opcoesSimNao = [
      { valor: '', rotulo: 'Não informado' },
      { valor: 'sim', rotulo: 'Sim' },
    ];
    const { rerender } = render(
      <EscolhaSegmentada aria-label="Sócio" opcoes={opcoesSimNao} valor="" onMudar={onMudar} />,
    );
    expect(screen.getByRole('button', { name: 'Não informado' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Sim' }));
    expect(onMudar).toHaveBeenCalledWith('sim');
    rerender(
      <EscolhaSegmentada aria-label="Sócio" opcoes={opcoesSimNao} valor="sim" onMudar={onMudar} />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Não informado' }));
    expect(onMudar).toHaveBeenLastCalledWith('');
  });
});
