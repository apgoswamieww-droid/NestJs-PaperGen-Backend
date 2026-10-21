import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuthModule } from '../../auth/auth.module.js';
import { PermissionsModule } from '../../auth/permissions.module.js';
import { RoleAudit, RoleAuditSchema } from '../../schemas/role-audit.schema.js';
import { Role, RoleSchema } from '../../schemas/role.schema.js';
import { User, UserSchema } from '../../schemas/user.schema.js';
import { RolesController } from './roles.controller.js';
import { RolesService } from './roles.service.js';

@Module({
  imports: [
    AuthModule,
    PermissionsModule,
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      { name: RoleAudit.name, schema: RoleAuditSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  controllers: [RolesController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
