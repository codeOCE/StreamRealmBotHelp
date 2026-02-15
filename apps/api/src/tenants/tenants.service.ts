import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma/prisma.service';
import { Tenant, Prisma } from '@stream-realm/database';

@Injectable()
export class TenantsService {
    constructor(private prisma: PrismaService) { }

    async tenant(tenantWhereUniqueInput: Prisma.TenantWhereUniqueInput): Promise<Tenant | null> {
        return this.prisma.tenant.findUnique({
            where: tenantWhereUniqueInput,
        });
    }

    async tenants(params: {
        skip?: number;
        take?: number;
        cursor?: Prisma.TenantWhereUniqueInput;
        where?: Prisma.TenantWhereInput;
        orderBy?: Prisma.TenantOrderByWithRelationInput;
    }): Promise<Tenant[]> {
        const { skip, take, cursor, where, orderBy } = params;
        return this.prisma.tenant.findMany({
            skip,
            take,
            cursor,
            where,
            orderBy,
        });
    }

    async createTenant(data: Prisma.TenantCreateInput): Promise<Tenant> {
        return this.prisma.tenant.create({
            data,
        });
    }

    async updateTenant(params: {
        where: Prisma.TenantWhereUniqueInput;
        data: Prisma.TenantUpdateInput;
    }): Promise<Tenant> {
        const { where, data } = params;
        return this.prisma.tenant.update({
            data,
            where,
        });
    }

    async deleteTenant(where: Prisma.TenantWhereUniqueInput): Promise<Tenant> {
        return this.prisma.tenant.delete({
            where,
        });
    }
}
