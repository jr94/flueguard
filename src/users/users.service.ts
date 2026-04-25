import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async create(createUserDto: CreateUserDto): Promise<Partial<User>> {
    const { first_name, last_name, email, password } = createUserDto;
    
    const existingUser = await this.userRepository.findOne({ where: { email } });
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const saltRounds = 10;
    const password_hash = await bcrypt.hash(password, saltRounds);

    const newUser = this.userRepository.create({
      first_name,
      last_name,
      email,
      password_hash,
      is_active: true,
    });

    const savedUser = await this.userRepository.save(newUser);
    
    // Remove password_hash from the response object
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash: _pw, ...result } = savedUser;
    
    return result;
  }

  async findOne(id: number): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async updateProfile(id: number, updateUserDto: UpdateUserDto): Promise<Partial<User>> {
    const user = await this.findOne(id);
    
    if (updateUserDto.nombre !== undefined) user.first_name = updateUserDto.nombre;
    if (updateUserDto.apellido !== undefined) user.last_name = updateUserDto.apellido;
    if (updateUserDto.region !== undefined) user.region_id = updateUserDto.region;
    if (updateUserDto.comuna !== undefined) user.comuna_id = updateUserDto.comuna;

    if (updateUserDto.password) {
      const saltRounds = 10;
      user.password_hash = await bcrypt.hash(updateUserDto.password, saltRounds);
    }

    const updatedUser = await this.userRepository.save(user);
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...result } = updatedUser;
    
    return result;
  }
  async findAll(): Promise<Partial<User>[]> {
    const users = await this.userRepository.find({ order: { created_at: 'DESC' } });
    return users.map(({ password_hash, ...u }) => u);
  }

  async adminCreate(dto: { first_name: string; last_name: string; email: string; password: string; is_active?: boolean }): Promise<Partial<User>> {
    const existing = await this.userRepository.findOne({ where: { email: dto.email } });
    if (existing) throw new ConflictException('El email ya está registrado');
    const password_hash = await bcrypt.hash(dto.password, 10);
    const user = this.userRepository.create({ ...dto, password_hash, is_active: dto.is_active ?? true });
    const saved = await this.userRepository.save(user);
    const { password_hash: _, ...result } = saved;
    return result;
  }

  async adminUpdate(id: number, dto: { first_name?: string; last_name?: string; email?: string; password?: string; is_active?: boolean }): Promise<Partial<User>> {
    const user = await this.findOne(id);
    if (dto.first_name !== undefined) user.first_name = dto.first_name;
    if (dto.last_name !== undefined) user.last_name = dto.last_name;
    if (dto.email !== undefined) user.email = dto.email;
    if (dto.is_active !== undefined) user.is_active = dto.is_active;
    if (dto.password) user.password_hash = await bcrypt.hash(dto.password, 10);
    const saved = await this.userRepository.save(user);
    const { password_hash: _, ...result } = saved;
    return result;
  }

  async delete(id: number): Promise<void> {
    await this.findOne(id);
    await this.userRepository.delete(id);
  }
}
