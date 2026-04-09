import { Controller, Get, Post, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  async register(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findOne(id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...result } = user;
    return result;
  }

  @UseGuards(JwtAuthGuard)
  @Get('get/:id')
  async getUserProfile(@Param('id', ParseIntPipe) id: number) {
    const user = await this.usersService.findOne(id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password_hash, ...result } = user;
    return result;
  }
}
