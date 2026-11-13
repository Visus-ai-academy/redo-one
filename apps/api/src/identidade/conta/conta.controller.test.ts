import { HttpStatus, ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it, vi } from 'vitest';

import { PERMISSOES_EXIGIDAS, ROTA_PUBLICA } from '../acesso/decorators';
import type { PrincipalUsuario } from '../principal';
import { ContaController } from './conta.controller';
import type { ContaService } from './conta.service';
import { AtualizarContaDto, TrocarSenhaDto } from './dto/conta.dto';

const eu = { usuarioId: 'u-1', sessaoId: 's-1' } as PrincipalUsuario;

describe('ContaController', () => {
  it('toda rota exige só estar logado: nem pública, nem permissão específica', () => {
    const reflector = new Reflector();
    const rotas = [
      'obter',
      'atualizar',
      'trocarSenha',
      'encerrarOutrasSessoes',
      'encerrarSessao',
      'acessos',
    ] as const;
    for (const rota of rotas) {
      expect(reflector.get(ROTA_PUBLICA, ContaController.prototype[rota])).toBeUndefined();
      expect(reflector.get(PERMISSOES_EXIGIDAS, ContaController.prototype[rota])).toBeUndefined();
    }
  });

  it('troca a senha da própria conta e devolve quantas sessões encerrou', async () => {
    const service = { trocarSenha: vi.fn(async () => ({ sessoesEncerradas: 2 })) };
    const controller = new ContaController(service as unknown as ContaService);

    await expect(
      controller.trocarSenha(eu, { senhaAtual: 'atual2026', novaSenha: 'nova2026' }),
    ).resolves.toEqual({ sessoesEncerradas: 2 });
    expect(service.trocarSenha).toHaveBeenCalledWith(eu, {
      senhaAtual: 'atual2026',
      novaSenha: 'nova2026',
    });
  });
});

describe('DTOs da conta', () => {
  const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });

  it('nome não pode ser vazio, e e-mail não se troca por aqui', async () => {
    const validar = (valor: unknown) =>
      pipe.transform(valor, { type: 'body', metatype: AtualizarContaDto });

    await expect(validar({ nome: 'Carlos' })).resolves.toBeDefined();
    await expect(validar({ nome: '  ' })).rejects.toMatchObject({ status: HttpStatus.BAD_REQUEST });
    await expect(validar({ nome: 'Carlos', email: 'x@y.com' })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('troca de senha exige as duas senhas', async () => {
    const validar = (valor: unknown) =>
      pipe.transform(valor, { type: 'body', metatype: TrocarSenhaDto });

    await expect(validar({ senhaAtual: 'a', novaSenha: 'b' })).resolves.toBeDefined();
    await expect(validar({ novaSenha: 'b' })).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });
});
