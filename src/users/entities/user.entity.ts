import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'first_name', length: 100 })
  first_name: string;

  @Column({ name: 'last_name', length: 100 })
  last_name: string;

  @Column({ name: 'region_id', type: 'int', nullable: true })
  region_id: number;

  @Column({ name: 'comuna_id', type: 'int', nullable: true })
  comuna_id: number;

  @Column({ unique: true, length: 150 })
  email: string;

  @Column({ name: 'password_hash' })
  password_hash: string;

  @Column({ name: 'is_active', default: true })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
