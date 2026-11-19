import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import { ClassificacoesEscalaController } from './classificacoes-escala.controller';
import type { ClassificacoesEscalaService } from './classificacoes-escala.service';

describe('ClassificacoesEscalaController', () => {
  const reflector = new Reflector();

  it('fica em /escala/classificacoes e exige só escala.ver (não catalogo.ver)', () => {
    expect(reflector.get(PATH_METADATA, ClassificacoesEscalaController)).toBe(
      'escala/classificacoes',
    );
    expect(
      reflector.get(PERMISSOES_EXIGIDAS, ClassificacoesEscalaController.prototype.listar),
    ).toEqual(['escala.ver']);
  });

  it('devolve as listas do service', async () => {
    const dados = {
      prioridades: [{ id: 'p-urg', nome: 'URGÊNCIA', cor: '#B5535A' }],
      subespecialidades: [{ id: 's-avc', nome: 'AVC', ativo: false, especialidadeIds: [] }],
    };
    const service = { listar: vi.fn(async () => dados) };
    const controller = new ClassificacoesEscalaController(
      service as unknown as ClassificacoesEscalaService,
    );

    await expect(controller.listar()).resolves.toEqual(dados);
  });
});
