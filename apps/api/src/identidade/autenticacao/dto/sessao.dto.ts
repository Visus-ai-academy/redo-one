import { ApiProperty } from '@nestjs/swagger';

export class UsuarioSessaoDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  nome!: string;

  @ApiProperty()
  email!: string;

  @ApiProperty({ format: 'uuid' })
  papelId!: string;
}

export class SessaoDto {
  @ApiProperty({ type: UsuarioSessaoDto })
  usuario!: UsuarioSessaoDto;

  @ApiProperty({ description: 'Quando a sessão expira se não for usada.' })
  expiraEm!: Date;
}

export class SessaoAtualDto {
  @ApiProperty({ type: UsuarioSessaoDto })
  usuario!: UsuarioSessaoDto;

  @ApiProperty({ description: 'Nome do papel do usuário.', example: 'Financeiro' })
  papel!: string;

  @ApiProperty({ description: 'Papel Administrador: pode tudo, mesmo sem listar as permissões.' })
  acessoTotal!: boolean;

  @ApiProperty({ type: [String], example: ['faturamento.ver', 'usuarios.ver'] })
  permissoes!: string[];
}

export class ErroLoginDto {
  @ApiProperty({ example: 'E-mail, CPF ou senha incorretos.' })
  message!: string;
}

export class AcessoBloqueadoDto {
  @ApiProperty({ example: 'Acesso bloqueado por excesso de tentativas.' })
  message!: string;

  @ApiProperty({ description: 'Quando o login volta a ser aceito.' })
  bloqueadoAte!: string;
}
