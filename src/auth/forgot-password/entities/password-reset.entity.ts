import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('password_resets')
export class PasswordReset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'user_id' })
  user_id: number;

  @Column({ length: 150 })
  email: string;

  @Column({ length: 6 })
  code: string;

  @Column({ length: 255, nullable: true })
  reset_token: string | null;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  verified: boolean;

  @Column({ type: 'datetime' })
  code_expires_at: Date;

  @Column({ type: 'datetime', nullable: true })
  token_expires_at: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
