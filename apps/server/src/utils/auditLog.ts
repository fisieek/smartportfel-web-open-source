import { Request } from 'express';
import prisma from '../lib/prisma';
import { logger } from './logger';

export type AuditAction =
    | 'auth.login'
    | 'auth.login_failed'
    | 'auth.login_locked'
    | 'auth.register'
    | 'auth.password_reset_requested'
    | 'auth.password_reset_completed'
    | 'auth.password_changed'
    | 'account.deleted'
    | 'account.data_exported'
    | 'system.cleanup'
    | 'household.created'
    | 'household.invited'
    | 'household.invitation_accepted'
    | 'household.invitation_declined'
    | 'household.member_left'
    | 'household.member_removed'
    | 'household.deleted';

// Zapis audytu nigdy nie może wywrócić właściwej operacji — błędy tylko logujemy
export const audit = async (
    action: AuditAction,
    opts: { userId?: string | null; resource?: string; req?: Request } = {}
): Promise<void> => {
    try {
        await prisma.auditLog.create({
            data: {
                action,
                userId: opts.userId ?? null,
                resource: opts.resource,
                ipAddress: opts.req?.ip,
                userAgent: opts.req?.headers['user-agent']?.slice(0, 255)
            }
        });
    } catch (err) {
        logger.error(`Audit log write failed for action ${action}:`, err);
    }
};
