import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { AjustesLaudoEmMemoria } from '../../testing/fakes';
import {
  AjusteLaudoInvalidoError,
  AjusteLaudoNaoEncontradoError,
  CriarAjusteLaudo,
  EncerrarAjusteLaudo,
  ListarAjustesLaudo,
} from './ajustes-laudo';

const agora = new Date('2026-11-26T15:00:00Z');

describe('ajuste manual do laudo no faturamento', () => {
  let repo: AjustesLaudoEmMemoria;
  let auditoria: InMemoryAuditoria;
  const criar = () => new CriarAjusteLaudo(repo, auditoria, () => agora);

  beforeEach(() => {
    repo = new AjustesLaudoEmMemoria();
    repo.laudos.set('l1', { id: 'l1', identidade: 'id1', competencia: '2026-10', clienteId: 'c1' });
    auditoria = new InMemoryAuditoria();
  });

  it('força o valor com motivo, quem e quando, e audita', async () => {
    const id = await criar().executar('u1', {
      laudoId: 'l1',
      tipo: 'valor',
      valorUnitarioCentavos: 5000,
      motivo: ' combinado com o cliente ',
    });
    expect(repo.ajustes).toMatchObject([
      {
        id,
        laudoIdentidade: 'id1',
        competencia: '2026-10',
        tipo: 'valor',
        valorUnitarioCentavos: 5000,
        motivo: 'combinado com o cliente',
        criadoPorId: 'u1',
        criadoEm: agora,
        encerradoEm: null,
      },
    ]);
    expect(auditoria.eventos.map((e) => [e.entidade, e.entidadeId, e.acao])).toEqual([
      ['ajuste_laudo_faturamento', id, 'criado'],
    ]);
  });

  it('trocar encerra o anterior (fica no histórico) e cria outro', async () => {
    const um = await criar().executar('u1', {
      laudoId: 'l1',
      tipo: 'excluir',
      valorUnitarioCentavos: null,
      motivo: 'teste',
    });
    const dois = await criar().executar('u2', {
      laudoId: 'l1',
      tipo: 'valor',
      valorUnitarioCentavos: 0,
      motivo: 'cortesia',
    });
    const lista = await new ListarAjustesLaudo(repo).executar('2026-10');
    expect(lista.map((a) => [a.id, a.encerradoEm !== null])).toEqual([
      [dois, false],
      [um, true],
    ]);
    expect(lista[1]?.motivoEncerramento).toBe('Trocado por outro ajuste: cortesia');
  });

  it('exige motivo, valor no tipo valor (inteiro, sem negativo) e laudo existente', async () => {
    const base = { laudoId: 'l1', tipo: 'valor' as const, valorUnitarioCentavos: 100, motivo: 'x' };
    await expect(criar().executar('u1', { ...base, motivo: ' ' })).rejects.toBeInstanceOf(
      AjusteLaudoInvalidoError,
    );
    await expect(
      criar().executar('u1', { ...base, valorUnitarioCentavos: null }),
    ).rejects.toBeInstanceOf(AjusteLaudoInvalidoError);
    await expect(
      criar().executar('u1', { ...base, valorUnitarioCentavos: -1 }),
    ).rejects.toBeInstanceOf(AjusteLaudoInvalidoError);
    await expect(
      criar().executar('u1', { ...base, valorUnitarioCentavos: 1.5 }),
    ).rejects.toBeInstanceOf(AjusteLaudoInvalidoError);
    await expect(criar().executar('u1', { ...base, laudoId: 'x' })).rejects.toBeInstanceOf(
      AjusteLaudoNaoEncontradoError,
    );
  });

  it('encerra com motivo; encerrado de novo é não encontrado', async () => {
    const id = await criar().executar('u1', {
      laudoId: 'l1',
      tipo: 'excluir',
      valorUnitarioCentavos: null,
      motivo: 'teste',
    });
    const encerrar = new EncerrarAjusteLaudo(repo, auditoria, () => agora);
    await expect(encerrar.executar('u1', id, '')).rejects.toBeInstanceOf(AjusteLaudoInvalidoError);
    await encerrar.executar('u1', id, 'era engano');
    expect(repo.ajustes[0]).toMatchObject({
      encerradoPorId: 'u1',
      motivoEncerramento: 'era engano',
    });
    await expect(encerrar.executar('u1', id, 'de novo')).rejects.toBeInstanceOf(
      AjusteLaudoNaoEncontradoError,
    );
  });
});
