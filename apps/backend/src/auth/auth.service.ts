import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ access_token: string }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('Email already registered');

    const password_hash = await bcrypt.hash(dto.password, 10);
    const user = await this.usersService.create(dto.email, password_hash);

    return {
      access_token: this.jwtService.sign({ sub: user.id, email: user.email }),
    };
  }

  async login(dto: LoginDto): Promise<{ access_token: string }> {
    const user = await this.usersService.findByEmail(dto.email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    return {
      access_token: this.jwtService.sign({ sub: user.id, email: user.email }),
    };
  }
}
