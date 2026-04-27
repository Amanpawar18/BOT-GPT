import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { AiModule } from './ai/ai.module';
import { ConversationsModule } from './conversations/conversations.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    CacheModule.register({ isGlobal: true, ttl: 60_000 }),
    DatabaseModule,
    AiModule,
    AuthModule,
    ConversationsModule,
    DocumentsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
