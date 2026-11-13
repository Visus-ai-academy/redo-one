import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

const aparar = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.trim() : value;

export class NovaChaveRoboDto {
  @ApiProperty({ example: 'Importação de laudos', maxLength: 80 })
  @Transform(aparar)
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  nome!: string;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 200 })
  @Transform(aparar)
  @IsOptional()
  @IsString()
  @MaxLength(200)
  descricao?: string | null;

  @ApiProperty({ type: [String], example: ['ingestao.laudos.importar'] })
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  permissoes!: string[];

  @ApiProperty({
    type: Number,
    nullable: true,
    enum: [90, 365],
    description: 'Dias até vencer; null = sem validade.',
  })
  @IsIn([90, 365, null])
  validadeDias!: 90 | 365 | null;
}

export class ChaveRoboDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() nome!: string;
  @ApiProperty({ type: String, nullable: true }) descricao!: string | null;
  @ApiProperty({ type: [String] }) permissoes!: string[];
  @ApiProperty({ example: 'one_7f3a9c2e', description: 'Começo da chave, para reconhecer.' })
  prefixo!: string;

  @ApiProperty({ type: Date, nullable: true }) expiraEm!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) revogadaEm!: Date | null;
  @ApiProperty({ type: Date, nullable: true }) ultimoUsoEm!: Date | null;
  @ApiProperty({ type: String, nullable: true }) ultimoIp!: string | null;
  @ApiProperty() criadaEm!: Date;
}

export class ChaveCriadaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;

  @ApiProperty({
    description:
      'A chave inteira. Só aparece nesta resposta: guarde no cofre de senhas do servidor do robô.',
  })
  chave!: string;
}

export class PermissaoRoboDto {
  @ApiProperty({ example: 'ingestao.laudos.importar' }) chave!: string;
  @ApiProperty({ example: 'Importar laudos' }) rotulo!: string;
}
