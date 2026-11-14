import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { ClienteDto } from '../clientes/dto/cliente.dto';
import { DeParaValorDto } from '../de-para/dto/de-para.dto';
import { ListaDto } from '../listas/dto/lista.dto';
import { ListarDto } from './dto';

// O mesmo pipe global do main.ts.
const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
const validar = (metatype: new () => object, valor: unknown, type: 'body' | 'query' = 'body') =>
  pipe.transform(valor, { type, metatype });

describe('DTOs do catálogo', () => {
  const item = { nome: 'MR', ordem: 0, ativo: true };

  it('recusa campo a mais e cor fora do formato hex', async () => {
    await expect(validar(ListaDto, { ...item, admin: true })).rejects.toThrow(BadRequestException);
    await expect(validar(ListaDto, { ...item, cor: 'vermelho' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(validar(ListaDto, { ...item, cor: '#1F7A4D' })).resolves.toMatchObject({
      cor: '#1F7A4D',
    });
  });

  it('cliente: recusa tipo de pessoa desconhecido e contratado que não é uuid', async () => {
    const cliente = { nome: 'A', ativo: true, ocultoDashboards: false };
    await expect(validar(ClienteDto, { ...cliente, tipoPessoa: 'XX' })).rejects.toThrow(
      BadRequestException,
    );
    await expect(validar(ClienteDto, { ...cliente, contratadoId: '1' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('de-para de valores: recusa valor negativo', async () => {
    await expect(
      validar(DeParaValorDto, { estudoDescricao: 'RM', valores: -1, ativo: true }),
    ).rejects.toThrow(BadRequestException);
  });

  it('listagem: converte a query e limita a página a 100 itens', async () => {
    await expect(
      validar(ListarDto, { ativo: 'false', pagina: '2' }, 'query'),
    ).resolves.toMatchObject({
      ativo: false,
      pagina: 2,
      porPagina: 25,
    });
    await expect(validar(ListarDto, { porPagina: '500' }, 'query')).rejects.toThrow(
      BadRequestException,
    );
  });
});
