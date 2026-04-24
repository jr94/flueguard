import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AccountDeletionService } from './account-deletion.service';
import { AccountDeletionController } from './account-deletion.controller';
import { DeleteAccountPageController } from './delete-account-page.controller';
import { AccountDeletionRequest } from './entities/account-deletion-request.entity';
import { User } from '../users/entities/user.entity';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([AccountDeletionRequest, User]),
    MailModule,
  ],
  controllers: [AccountDeletionController, DeleteAccountPageController],
  providers: [AccountDeletionService],
})
export class AccountDeletionModule {}
