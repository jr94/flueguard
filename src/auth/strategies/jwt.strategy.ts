import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../../users/users.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Token } from '../entities/token.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    @InjectRepository(Token)
    private readonly tokenRepository: Repository<Token>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET') || 'super_secret_jwt_key_here',
      passReqToCallback: true,
    });
  }

  async validate(req: any, payload: any) {
    // Check if the user exists and is active
    const user = await this.usersService.findOne(payload.sub);
    if (!user || !user.is_active) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Extract raw token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      throw new UnauthorizedException('Missing authorization header');
    }
    const rawToken = authHeader.replace('Bearer ', '').trim();

    // Verify token exists in database for this user 
    const dbToken = await this.tokenRepository.findOne({
      where: { user_id: payload.sub, token: rawToken }
    });

    if (!dbToken) {
      throw new UnauthorizedException('Token is no longer valid. Another session is active.');
    }

    // Check custom expiration from DB, though JWT library usually catches expiration first
    if (dbToken.expires_at && new Date() > new Date(dbToken.expires_at)) {
      throw new UnauthorizedException('Token has expired in database');
    }

    return { id: payload.sub, email: payload.email };
  }
}
