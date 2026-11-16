import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsInt, IsNotEmpty, IsString, IsUUID, MaxLength, Min } from 'class-validator';

import { aparar } from '../../../../catalogo/comum/dto';

export class PedidoEnvioDto {
  @ApiProperty({ example: 'laudos_outubro.xlsx', maxLength: 200 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  nomeArquivo!: string;

  @ApiProperty({ type: 'integer', minimum: 1, description: 'Tamanho exato do arquivo em bytes.' })
  @IsInt()
  @Min(1)
  tamanhoBytes!: number;

  @ApiProperty({
    example: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    maxLength: 200,
  })
  @IsString()
  @MaxLength(200)
  tipoConteudo!: string;
}

export class EnvioDto {
  @ApiProperty({ format: 'uuid' }) arquivoId!: string;

  @ApiProperty({ description: 'URL assinada: PUT do arquivo com o mesmo Content-Type e tamanho.' })
  url!: string;

  @ApiProperty({ type: String, format: 'date-time' }) expiraEm!: Date;
}

export class ConfirmarEnvioDto {
  @ApiProperty({ format: 'uuid' }) @IsUUID() arquivoId!: string;
}
