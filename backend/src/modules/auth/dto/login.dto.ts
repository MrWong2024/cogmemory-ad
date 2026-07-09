// backend/src/modules/auth/dto/login.dto.ts
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  accountName!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  password!: string;
}
