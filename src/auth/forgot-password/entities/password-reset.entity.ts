import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn } from 'typeorm';

@Entity('password_resets')
export class PasswordReset {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int' })
  user_id: number;

  @Column({ type: 'varchar', length: 150 })
  email: string;

  @Column({ type: 'varchar', length: 6 })
  code: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  reset_token: string | null;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  verified: number;

  @Column({ type: 'datetime' })
  code_expires_at: Date;

  @Column({ type: 'datetime', nullable: true })
  token_expires_at: Date | null;

  @CreateDateColumn({ type: 'datetime' })
  created_at: Date;
}
