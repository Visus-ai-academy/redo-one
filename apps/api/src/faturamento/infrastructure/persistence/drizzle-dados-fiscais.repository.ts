import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { DATABASE, type Database } from '../../../database/database';
import { clientes, clientesDadosFiscais, usuarios } from '../../../database/schema';
import type { Autor } from '../../application/ports/competencias.repository';
import type {
  DadosFiscaisRegistrados,
  DadosFiscaisRepository,
} from '../../application/ports/dados-fiscais.repository';
import type { DadosFiscais } from '../../domain/dados-fiscais';

const t = clientesDadosFiscais;

@Injectable()
export class DrizzleDadosFiscaisRepository implements DadosFiscaisRepository {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async clienteExiste(clienteId: string): Promise<boolean> {
    const [linha] = await this.db
      .select({ id: clientes.id })
      .from(clientes)
      .where(eq(clientes.id, clienteId));
    return Boolean(linha);
  }

  async obter(clienteId: string): Promise<DadosFiscaisRegistrados | null> {
    const [l] = await this.db
      .select({ linha: t, atualizadoPor: usuarios.nome })
      .from(t)
      .leftJoin(usuarios, eq(usuarios.id, t.atualizadoPorId))
      .where(eq(t.clienteId, clienteId));
    if (!l) return null;
    const { linha } = l;
    return {
      dados: {
        emailsNf: linha.emailsNf,
        email: linha.email,
        contatoNome: linha.contatoNome,
        telefone: linha.telefone,
        cep: linha.cep,
        logradouro: linha.logradouro,
        numero: linha.numero,
        complemento: linha.complemento,
        bairro: linha.bairro,
        cidade: linha.cidade,
        uf: linha.uf,
        bancoCodigo: linha.bancoCodigo,
        bancoAgencia: linha.bancoAgencia,
        bancoConta: linha.bancoConta,
        exclusaoFiscal: linha.exclusaoFiscal,
      },
      omie: { codigoCliente: linha.omieCodigoCliente, sincronizadoEm: linha.omieSincronizadoEm },
      atualizadoEm: linha.atualizadoEm,
      atualizadoPor: l.atualizadoPor,
    };
  }

  async salvar(clienteId: string, dados: DadosFiscais, { usuarioId, em }: Autor): Promise<void> {
    const valores = { ...dados, atualizadoEm: em, atualizadoPorId: usuarioId };
    await this.db
      .insert(t)
      .values({ clienteId, ...valores })
      .onConflictDoUpdate({ target: t.clienteId, set: valores });
  }
}
