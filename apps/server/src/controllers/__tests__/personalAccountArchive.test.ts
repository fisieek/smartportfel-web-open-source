import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import * as controller from '../personalAccountController';
import prisma from '../../lib/prisma';
import { validatePersonalAccountOwnership } from '../../utils/ownershipValidator';

vi.mock('../../lib/prisma', () => ({
    default: {
        personalAccount: { findUnique: vi.fn(), update: vi.fn() },
    },
}));

vi.mock('../../utils/ownershipValidator', () => ({
    validatePersonalAccountOwnership: vi.fn(),
}));

vi.mock('../../utils/householdScope', () => ({
    getHouseholdCoMemberIds: vi.fn().mockResolvedValue([]),
}));

let jsonMock: any;
let statusMock: any;
let res: Response;

const makeRes = () => {
    jsonMock = vi.fn();
    statusMock = vi.fn().mockReturnValue({ json: jsonMock });
    return { json: jsonMock, status: statusMock } as any;
};

beforeEach(() => {
    vi.clearAllMocks();
    res = makeRes();
    (validatePersonalAccountOwnership as any).mockResolvedValue(true);
});

describe('archivePersonalAccount', () => {
    it('ustawia closedAt na podaną datę', async () => {
        (prisma.personalAccount.findUnique as any).mockResolvedValue({ id: 'a1', isSystem: false });
        (prisma.personalAccount.update as any).mockResolvedValue({ id: 'a1', closedAt: new Date('2025-03-10') });
        const req = { user: { userId: 'u1' }, params: { id: 'a1' }, body: { closedAt: '2025-03-10' } } as any;

        await controller.archivePersonalAccount(req, res);

        expect(prisma.personalAccount.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'a1' },
            data: expect.objectContaining({ closedAt: expect.any(Date) }),
        }));
        expect(jsonMock).toHaveBeenCalled();
    });

    it('blokuje zamknięcie konta systemowego (403)', async () => {
        (prisma.personalAccount.findUnique as any).mockResolvedValue({ id: 'cash', isSystem: true });
        const req = { user: { userId: 'u1' }, params: { id: 'cash' }, body: {} } as any;

        await controller.archivePersonalAccount(req, res);

        expect(statusMock).toHaveBeenCalledWith(403);
        expect(prisma.personalAccount.update).not.toHaveBeenCalled();
    });

    it('odrzuca datę z przyszłości (400)', async () => {
        (prisma.personalAccount.findUnique as any).mockResolvedValue({ id: 'a1', isSystem: false });
        const future = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString();
        const req = { user: { userId: 'u1' }, params: { id: 'a1' }, body: { closedAt: future } } as any;

        await controller.archivePersonalAccount(req, res);

        expect(statusMock).toHaveBeenCalledWith(400);
        expect(prisma.personalAccount.update).not.toHaveBeenCalled();
    });

    it('zwraca 403 gdy konto nie należy do użytkownika', async () => {
        (validatePersonalAccountOwnership as any).mockResolvedValue(false);
        const req = { user: { userId: 'u1' }, params: { id: 'a1' }, body: {} } as any;

        await controller.archivePersonalAccount(req, res);

        expect(statusMock).toHaveBeenCalledWith(403);
    });
});

describe('unarchivePersonalAccount', () => {
    it('zeruje closedAt', async () => {
        (prisma.personalAccount.findUnique as any).mockResolvedValue({ id: 'a1', isSystem: false, closedAt: new Date() });
        (prisma.personalAccount.update as any).mockResolvedValue({ id: 'a1', closedAt: null });
        const req = { user: { userId: 'u1' }, params: { id: 'a1' }, body: {} } as any;

        await controller.unarchivePersonalAccount(req, res);

        expect(prisma.personalAccount.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 'a1' },
            data: expect.objectContaining({ closedAt: null }),
        }));
        expect(jsonMock).toHaveBeenCalled();
    });
});
