import { PATH_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS } from '../../identidade/acesso/decorators';
import { ListarMedicosEscalaDto } from './dto/medicos-escala.dto';
import { MedicosEscalaController } from './medicos-escala.controller';
import type { MedicosEscalaService } from './medicos-escala.service';

describe('MedicosEscalaController', () => {
  const reflector = new Reflector();

  it('fica em /escala/medicos e exige escala.ver nas duas rotas', () => {
    expect(reflector.get(PATH_METADATA, MedicosEscalaController)).toBe('escala/medicos');
    for (const rota of [
      MedicosEscalaController.prototype.listar,
      MedicosEscalaController.prototype.obter,
    ]) {
      expect(reflector.get(PERMISSOES_EXIGIDAS, rota)).toEqual(['escala.ver']);
    }
  });

  it('lista com os filtros da query e devolve a página', async () => {
    const service = {
      listar: vi.fn(async () => ({ itens: [{ id: 'm-1', nome: 'Ana', ativo: true }], total: 31 })),
    };
    const controller = new MedicosEscalaController(service as unknown as MedicosEscalaService);
    const query = plainToInstance(ListarMedicosEscalaDto, {
      busca: ' ana ',
      ativo: 'true',
      pagina: '2',
    });

    const resposta = await controller.listar(query);

    expect(service.listar).toHaveBeenCalledWith({
      busca: 'ana',
      ativo: true,
      pagina: 2,
      porPagina: 25,
    });
    expect(resposta).toEqual({
      itens: [{ id: 'm-1', nome: 'Ana', ativo: true }],
      total: 31,
      pagina: 2,
      porPagina: 25,
    });
  });

  it('obtém pelo id', async () => {
    const service = { obter: vi.fn(async () => ({ id: 'm-1', nome: 'Ana', ativo: false })) };
    const controller = new MedicosEscalaController(service as unknown as MedicosEscalaService);

    await expect(controller.obter('m-1')).resolves.toEqual({
      id: 'm-1',
      nome: 'Ana',
      ativo: false,
    });
    expect(service.obter).toHaveBeenCalledWith('m-1');
  });

  it('recusa busca longa demais e situação que não é booleana', async () => {
    const erros = await validate(
      plainToInstance(ListarMedicosEscalaDto, { busca: 'a'.repeat(101), ativo: 'sim' }),
    );
    expect(erros.map((e) => e.property).sort()).toEqual(['ativo', 'busca']);
  });
});
