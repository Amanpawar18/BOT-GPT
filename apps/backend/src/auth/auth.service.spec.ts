import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

const mockUsersService = {
  findByEmail: jest.fn(),
  create: jest.fn(),
};

const mockJwtService = {
  sign: jest.fn().mockReturnValue('mock-token'),
};

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
      ],
    }).compile();
    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('returns access_token on success', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);
      mockUsersService.create.mockResolvedValue({
        id: 'uid-1',
        email: 'a@b.com',
      });

      const result = await service.register({
        email: 'a@b.com',
        password: 'password123',
      });

      expect(result).toEqual({ access_token: 'mock-token' });
      expect(mockUsersService.create).toHaveBeenCalledWith(
        'a@b.com',
        expect.any(String),
      );
    });

    it('throws ConflictException if email exists', async () => {
      mockUsersService.findByEmail.mockResolvedValue({ id: 'uid-1' });

      await expect(
        service.register({ email: 'a@b.com', password: 'password123' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('login', () => {
    it('returns access_token for valid credentials', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'uid-1',
        email: 'a@b.com',
        password_hash: 'hashed',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login({
        email: 'a@b.com',
        password: 'password123',
      });

      expect(result).toEqual({ access_token: 'mock-token' });
    });

    it('throws UnauthorizedException for unknown email', async () => {
      mockUsersService.findByEmail.mockResolvedValue(null);

      await expect(
        service.login({ email: 'a@b.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws UnauthorizedException for wrong password', async () => {
      mockUsersService.findByEmail.mockResolvedValue({
        id: 'uid-1',
        password_hash: 'hashed',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(
        service.login({ email: 'a@b.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
