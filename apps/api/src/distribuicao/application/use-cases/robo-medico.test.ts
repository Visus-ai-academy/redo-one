import { beforeEach, describe, expect, it } from 'vitest';

import { InMemoryAuditoria } from '../../../auditoria/testing';
import { CadastrosEmMemoria, ParametrosMedicoEmMemoria } from '../../testing/fakes';
import { MedicoNaoEncontradoError } from '../erros';
import { DefinirRoboMedico, ObterRoboMedico } from './robo-medico';

const agora = new Date('2026-11-17T18:00:00Z');
const ator = { tipo: 'usuario' as const, id: 'u1' };

describe('robô do médico', () => {
  let parametros: ParametrosMedicoEmMemoria;
  let auditoria: InMemoryAuditoria;
  let obter: ObterRoboMedico;
  let definir: DefinirRoboMedico;

  beforeEach(() => {
    parametros = new ParametrosMedicoEmMemoria();
    const cadastros = new CadastrosEmMemoria();
    cadastros.medicos.add('m1');
    auditoria = new InMemoryAuditoria();
    obter = new ObterRoboMedico(parametros, cadastros);
    definir = new DefinirRoboMedico(parametros, cadastros, auditoria, () => agora);
  });

  it('médico sem parâmetros não está habilitado', async () => {
    expect(await obter.executar('m1')).toEqual({ habilitadoRobo: false });
  });

  it('habilita e audita a mudança', async () => {
    await definir.executar(ator, 'm1', { habilitadoRobo: true });
    expect(await obter.executar('m1')).toEqual({ habilitadoRobo: true });
    expect(auditoria.eventos).toEqual([
      {
        ator,
        entidade: 'medico_distribuicao',
        entidadeId: 'm1',
        acao: 'alterado',
        antes: { habilitadoRobo: false },
        depois: { habilitadoRobo: true },
        em: agora,
      },
    ]);
  });

  it('sem mudança, não audita', async () => {
    await definir.executar(ator, 'm1', { habilitadoRobo: false });
    expect(auditoria.eventos).toEqual([]);
  });

  it('médico inexistente dá não encontrado', async () => {
    await expect(obter.executar('x')).rejects.toThrow(MedicoNaoEncontradoError);
    await expect(definir.executar(ator, 'x', { habilitadoRobo: true })).rejects.toThrow(
      MedicoNaoEncontradoError,
    );
  });
});
