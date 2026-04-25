import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { PortalUser } from './entities/portal-user.entity';
import { PortalPermission } from './entities/portal-permission.entity';
import { PortalLoginDto } from './dto/portal-login.dto';

@Injectable()
export class PortalAuthService {
  constructor(
    @InjectRepository(PortalUser)
    private readonly portalUserRepository: Repository<PortalUser>,
    @InjectRepository(PortalPermission)
    private readonly portalPermissionRepository: Repository<PortalPermission>,
    private readonly jwtService: JwtService,
  ) {}

  async login(dto: PortalLoginDto) {
    try {
      // 1. Find user by email including permissions
      const user = await this.portalUserRepository.findOne({
        where: { email: dto.email },
        relations: ['permissions'],
      });

      if (!user) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      if (!user.is_active) {
        throw new UnauthorizedException('Usuario inactivo. Contacte al administrador.');
      }

      // 2. Verify password
      let isMatch = false;
      try {
        isMatch = await bcrypt.compare(dto.password, user.password);
      } catch (e) {
        // Fallback for plain text
        isMatch = (dto.password === user.password);
      }

      if (!isMatch) {
        throw new UnauthorizedException('Credenciales inválidas');
      }

      // 3. Update last_login_at (safe update)
      try {
        await this.portalUserRepository.update(user.id, {
          last_login_at: new Date(),
        });
      } catch (e) {
        console.warn('Could not update last_login_at:', e);
      }

      // 4. Generate JWT with portal scope
      const payload = {
        email: user.email,
        sub: user.id,
        scope: 'portal',
        role: user.role,
      };
      
      let accessToken;
      try {
        accessToken = this.jwtService.sign(payload);
      } catch (jwtError) {
        throw new Error('JWT Sign failed: ' + jwtError.message);
      }

      // 5. Return token + safe user data
      return {
        access_token: accessToken,
        user: {
          id: user.id,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role,
          permissions: user.permissions,
        },
      };
    } catch (err) {
      console.error('Login error detailed:', err);
      if (err instanceof UnauthorizedException) throw err;
      throw new Error(`Login crash: ${err.message}`);
    }
  }

  async findUserById(id: number): Promise<PortalUser | null> {
    return this.portalUserRepository.findOne({
      where: { id },
      relations: ['permissions'],
    });
  }

  async updateProfile(userId: number, updates: { first_name?: string; last_name?: string; password?: string }) {
    if (updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    await this.portalUserRepository.update(userId, updates);
    return this.findUserById(userId);
  }

  // ── Administrative CRUD for Portal Users ────────────────────────────────

  async findAll(): Promise<PortalUser[]> {
    return this.portalUserRepository.find({
      relations: ['permissions'],
      order: { created_at: 'DESC' },
    });
  }

  async createPortalUser(dto: any) {
    const { permissions, password, ...userData } = dto;
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = this.portalUserRepository.create({
      ...userData,
      password: hashedPassword,
    });
    const savedUser = await this.portalUserRepository.save(newUser) as any;

    const newPermissions = this.portalPermissionRepository.create({
      ...permissions,
      portal_user_id: savedUser.id,
    });
    await this.portalPermissionRepository.save(newPermissions);

    return this.findUserById(savedUser.id);
  }

  async updatePortalUser(id: number, dto: any) {
    const { permissions, password, ...userData } = dto;
    
    if (password) {
      userData.password = await bcrypt.hash(password, 10);
    }

    await this.portalUserRepository.update(id, userData);

    if (permissions) {
      // Clean up permissions to ensure they are boolean
      const cleanPermissions = {};
      for (const key in permissions) {
        cleanPermissions[key] = !!permissions[key];
      }

      // Check if permission record exists
      const existingPerm = await this.portalPermissionRepository.findOne({ where: { portal_user_id: id } });
      if (existingPerm) {
        await this.portalPermissionRepository.update({ portal_user_id: id }, cleanPermissions);
      } else {
        const newPerm = this.portalPermissionRepository.create({
          ...cleanPermissions,
          portal_user_id: id,
        });
        await this.portalPermissionRepository.save(newPerm);
      }
    }

    return this.findUserById(id);
  }

  async deletePortalUser(id: number) {
    // Delete permissions first due to relation
    await this.portalPermissionRepository.delete({ portal_user_id: id });
    await this.portalUserRepository.delete(id);
    return { success: true };
  }
}
