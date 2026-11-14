import { Inject, Injectable } from '@nestjs/common';

import { ErroDeDominio } from '../../comum/erro-de-dominio';
import { SenhaService } from '../senha/senha.service';
import {
  GESTAO_USUARIOS_REPOSITORY,
  type GestaoUsuariosRepository,
} from '../usuarios/gestao-usuarios.repository';
import {
  PAPEIS_SISTEMA_REPOSITORY,
  type PapeisSistemaRepository,
} from './papeis-sistema.repository';

export class AdministradorJaExisteError extends ErroDeDominio {
  readonly tipo = 'conflito';

  constructor() {
    super('Já existe um Administrador. Os próximos usuários são convidados pela tela Usuários.');
  }
}

/** Banco vazio: cria os papéis do sistema e convida o primeiro Administrador. */
@Injectable()
export class PrimeiroAcessoService {
  constructor(
    @Inject(PAPEIS_SISTEMA_REPOSITORY) private readonly sistema: PapeisSistemaRepository,
    @Inject(GESTAO_USUARIOS_REPOSITORY) private readonly usuarios: GestaoUsuariosRepository,
    private readonly senha: SenhaService,
  ) {}

  /** Devolve o link do convite (também enviado por e-mail), para quem roda o comando. */
  async criarAdministrador(dados: { nome: string; email: string }): Promise<{ link: string }> {
    if (await this.sistema.existeAdministrador()) throw new AdministradorJaExisteError();
    const { administradorId } = await this.sistema.garantir();

    const nome = dados.nome.trim();
    const email = dados.email.trim().toLowerCase();
    const convite = this.senha.prepararConvite({
      nome,
      email,
      papel: 'Administrador',
      convidadoPor: null,
    });
    await this.usuarios.convidar(
      { nome, email, cpf: null, papelId: administradorId, medicoId: null },
      convite.token,
      () => convite.email,
    );
    return { link: convite.link };
  }
}
