import { Global, Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Role, RoleSchema } from '../schemas/role.schema.js';
import { User, UserSchema } from '../schemas/user.schema.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { RolePermissionsService } from './role-permissions.service.js';

@Global()
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Role.name, schema: RoleSchema },
      { name: User.name, schema: UserSchema },
    ]),
  ],
  providers: [RolePermissionsService, PermissionsGuard],
  exports: [RolePermissionsService, PermissionsGuard],
})
export class PermissionsModule {}
