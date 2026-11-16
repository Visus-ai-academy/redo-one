import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../../identidade/acesso/decorators';
import type { PrincipalUsuario } from '../../../identidade/principal';
import type { ConfirmarEnvio, PrepararEnvio } from '../../application/use-cases/envio-planilha';
import { ImportacoesController } from './importacoes.controller';

const ator = { tipo: 'usuario', usuarioId: 'u1' } as PrincipalUsuario;

describe('ImportacoesController', () => {
  const reflector = new Reflector();
  const exigidas = (m: keyof ImportacoesController) =>
    reflector.get(PERMISSOES_EXIGIDAS, ImportacoesController.prototype[m]);

  it('fica em /ingestao; enviar exige importacao.enviar', () => {
    expect(reflector.get(PATH_METADATA, ImportacoesController)).toBe('ingestao');
    expect(exigidas('prepararEnvio')).toEqual(['importacao.enviar']);
    expect(exigidas('confirmarEnvio')).toEqual(['importacao.enviar']);
  });

  it('prepara o envio em nome de quem está logado', async () => {
    const preparar = {
      executar: vi.fn(async () => ({ arquivoId: 'a1', url: 'u', expiraEm: new Date(0) })),
    };
    const controller = new ImportacoesController(
      preparar as unknown as PrepararEnvio,
      {} as ConfirmarEnvio,
    );

    const r = await controller.prepararEnvio(ator, {
      nomeArquivo: 'laudos.xlsx',
      tamanhoBytes: 10,
      tipoConteudo: 'x',
    });

    expect(preparar.executar).toHaveBeenCalledWith({
      usuarioId: 'u1',
      nomeArquivo: 'laudos.xlsx',
      tamanhoBytes: 10,
      tipoConteudo: 'x',
    });
    expect(r).toEqual({ arquivoId: 'a1', url: 'u', expiraEm: new Date(0) });
  });

  it('confirma o envio e devolve o id da importação', async () => {
    const confirmar = { executar: vi.fn(async () => 'i1') };
    const controller = new ImportacoesController(
      {} as PrepararEnvio,
      confirmar as unknown as ConfirmarEnvio,
    );

    expect(await controller.confirmarEnvio(ator, { arquivoId: 'a1' })).toEqual({ id: 'i1' });
    expect(confirmar.executar).toHaveBeenCalledWith({ usuarioId: 'u1', arquivoId: 'a1' });
  });
});
