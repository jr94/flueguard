import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { Token } from './entities/token.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
  ) {}

  async validateUser(email: string, pass: string): Promise<any> {
    const user = await this.usersService.findByEmail(email);
    
    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.is_active) {
      throw new UnauthorizedException('User is not active');
    }

    const isMatch = await bcrypt.compare(pass, user.password_hash);
    
    if (isMatch) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { password_hash, ...result } = user;
      return result;
    }
    
    throw new UnauthorizedException('Invalid credentials');
  }

  async login(loginDto: LoginDto) {
    const user = await this.validateUser(loginDto.email, loginDto.password);
    
    const payload = { email: user.email, sub: user.id };
    const accessToken = this.jwtService.sign(payload);

    // Calc expiration date: current time + 30 days
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const deviceType = loginDto.device_type || 'android';

    // Find if a token already exists for the user AND device_type
    let tokenRecord = await this.tokenRepository.findOne({ where: { user_id: user.id, device_type: deviceType } });
    
    if (tokenRecord) {
      // Update existing token
      tokenRecord.token = accessToken;
      tokenRecord.expires_at = expiresAt;
    } else {
      // Save new token
      tokenRecord = this.tokenRepository.create({
        user_id: user.id,
        device_type: deviceType,
        token: accessToken,
        expires_at: expiresAt,
      });
    }
    
    await this.tokenRepository.save(tokenRecord);

    return {
      access_token: accessToken,
      user,
    };
  }
}
