import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Response } from 'express';
import * as householdController from '../householdController';
import prisma from '../../lib/prisma';

vi.mock('../../lib/prisma', () => ({
    default: {
        householdMember: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn(), count: vi.fn() },
        household: { findUnique: vi.fn(), create: vi.fn(), delete: vi.fn() },
        householdInvitation: { findUnique: vi.fn(), findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
        user: { findUnique: vi.fn() },
        $transaction: vi.fn((ops) => Promise.all(ops)),
    },
}));

vi.mock('../../utils/email', () => ({ sendHouseholdInvitationEmail: vi.fn() }));
vi.mock('../../utils/auditLog', () => ({ audit: vi.fn() }));

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
});

describe('createHousehold', () => {
    it('odrzuca, gdy użytkownik już należy do gospodarstwa', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue({ id: 'm1' });
        const req = { user: { userId: 'u1' }, body: { name: 'Dom' } } as any;
        await householdController.createHousehold(req, res);
        expect(statusMock).toHaveBeenCalledWith(409);
    });

    it('wymaga nazwy', async () => {
        const req = { user: { userId: 'u1' }, body: { name: '  ' } } as any;
        await householdController.createHousehold(req, res);
        expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('tworzy gospodarstwo z twórcą jako OWNER', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue(null);
        (prisma.household.create as any).mockResolvedValue({ id: 'h1', name: 'Dom', members: [] });
        const req = { user: { userId: 'u1' }, body: { name: 'Dom' } } as any;
        await householdController.createHousehold(req, res);
        expect(statusMock).toHaveBeenCalledWith(201);
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ role: 'OWNER' }));
    });
});

describe('inviteMember', () => {
    it('blokuje nie-właściciela', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue({ id: 'm1', householdId: 'h1', role: 'MEMBER' });
        const req = { user: { userId: 'u1' }, body: { email: 'a@b.pl' } } as any;
        await householdController.inviteMember(req, res);
        expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('odrzuca nieprawidłowy e-mail', async () => {
        const req = { user: { userId: 'u1' }, body: { email: 'zły' } } as any;
        await householdController.inviteMember(req, res);
        expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('blokuje zaproszenie osoby już w gospodarstwie', async () => {
        (prisma.householdMember.findUnique as any)
            .mockResolvedValueOnce({ id: 'm1', householdId: 'h1', role: 'OWNER' }) // inviter
            .mockResolvedValueOnce({ id: 'm2', householdId: 'hX' }); // invitee membership
        (prisma.user.findUnique as any)
            .mockResolvedValueOnce({ email: 'owner@x.pl', username: 'Owner' }) // me
            .mockResolvedValueOnce({ id: 'u2' }); // invitee
        const req = { user: { userId: 'u1' }, body: { email: 'a@b.pl' } } as any;
        await householdController.inviteMember(req, res);
        expect(statusMock).toHaveBeenCalledWith(409);
    });

    it('tworzy zaproszenie i wysyła e-mail (happy path)', async () => {
        (prisma.householdMember.findUnique as any)
            .mockResolvedValueOnce({ id: 'm1', householdId: 'h1', role: 'OWNER' }); // inviter
        (prisma.user.findUnique as any)
            .mockResolvedValueOnce({ email: 'owner@x.pl', username: 'Owner' }) // me
            .mockResolvedValueOnce(null); // invitee nie ma konta
        (prisma.householdInvitation.findFirst as any).mockResolvedValue(null);
        (prisma.householdInvitation.create as any).mockResolvedValue({ id: 'inv1' });
        (prisma.household.findUnique as any).mockResolvedValue({ name: 'Dom' });
        const req = { user: { userId: 'u1' }, body: { email: 'a@b.pl' } } as any;
        await householdController.inviteMember(req, res);
        expect(statusMock).toHaveBeenCalledWith(201);
    });
});

describe('acceptInvitation', () => {
    it('blokuje, gdy użytkownik już w gospodarstwie', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue({ id: 'm1' });
        const req = { user: { userId: 'u1' }, body: { token: 'tok' } } as any;
        await householdController.acceptInvitation(req, res);
        expect(statusMock).toHaveBeenCalledWith(409);
    });

    it('odrzuca token wysłany na inny e-mail', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue(null);
        (prisma.householdInvitation.findUnique as any).mockResolvedValue({
            id: 'inv1', householdId: 'h1', status: 'PENDING', email: 'inny@x.pl', expiresAt: new Date(Date.now() + 100000)
        });
        (prisma.user.findUnique as any).mockResolvedValue({ email: 'ja@x.pl' });
        const req = { user: { userId: 'u1' }, body: { token: 'tok' } } as any;
        await householdController.acceptInvitation(req, res);
        expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('odrzuca wygasłe zaproszenie', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue(null);
        (prisma.householdInvitation.findUnique as any).mockResolvedValue({
            id: 'inv1', householdId: 'h1', status: 'PENDING', email: 'ja@x.pl', expiresAt: new Date(Date.now() - 1000)
        });
        const req = { user: { userId: 'u1' }, body: { token: 'tok' } } as any;
        await householdController.acceptInvitation(req, res);
        expect(statusMock).toHaveBeenCalledWith(404);
    });

    it('przyjmuje zaproszenie (happy path) i dodaje jako MEMBER', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue(null);
        (prisma.householdInvitation.findUnique as any).mockResolvedValue({
            id: 'inv1', householdId: 'h1', status: 'PENDING', email: 'ja@x.pl', expiresAt: new Date(Date.now() + 100000)
        });
        (prisma.user.findUnique as any).mockResolvedValue({ email: 'ja@x.pl' });
        (prisma.householdMember.create as any).mockResolvedValue({ id: 'm1' });
        (prisma.householdInvitation.updateMany as any).mockResolvedValue({ count: 1 });
        (prisma.household.findUnique as any).mockResolvedValue({ id: 'h1', members: [] });
        const req = { user: { userId: 'u1' }, body: { token: 'tok' } } as any;
        await householdController.acceptInvitation(req, res);
        expect(prisma.$transaction).toHaveBeenCalled();
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ role: 'MEMBER' }));
    });

    it('zamyka WSZYSTKIE oczekujące zaproszenia dla (gospodarstwo, email), nie tylko ten token', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue(null);
        (prisma.householdInvitation.findUnique as any).mockResolvedValue({
            id: 'inv1', householdId: 'h1', status: 'PENDING', email: 'ja@x.pl', expiresAt: new Date(Date.now() + 100000)
        });
        (prisma.user.findUnique as any).mockResolvedValue({ email: 'ja@x.pl' });
        (prisma.householdMember.create as any).mockResolvedValue({ id: 'm1' });
        (prisma.householdInvitation.updateMany as any).mockResolvedValue({ count: 2 });
        (prisma.household.findUnique as any).mockResolvedValue({ id: 'h1', members: [] });
        const req = { user: { userId: 'u1' }, body: { token: 'tok' } } as any;
        await householdController.acceptInvitation(req, res);
        expect(prisma.householdInvitation.updateMany).toHaveBeenCalledWith({
            where: { householdId: 'h1', email: 'ja@x.pl', status: 'PENDING' },
            data: { status: 'ACCEPTED' }
        });
    });
});

describe('leaveHousehold', () => {
    it('właściciel z innymi członkami nie może wyjść', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue({ id: 'm1', householdId: 'h1', role: 'OWNER' });
        (prisma.householdMember.count as any).mockResolvedValue(2);
        const req = { user: { userId: 'u1' } } as any;
        await householdController.leaveHousehold(req, res);
        expect(statusMock).toHaveBeenCalledWith(409);
    });

    it('właściciel sam — kasuje gospodarstwo', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue({ id: 'm1', householdId: 'h1', role: 'OWNER' });
        (prisma.householdMember.count as any).mockResolvedValue(1);
        (prisma.household.delete as any).mockResolvedValue({});
        const req = { user: { userId: 'u1' } } as any;
        await householdController.leaveHousehold(req, res);
        expect(prisma.household.delete).toHaveBeenCalledWith({ where: { id: 'h1' } });
        expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({ message: expect.any(String) }));
    });

    it('zwykły członek opuszcza gospodarstwo', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue({ id: 'm2', householdId: 'h1', role: 'MEMBER' });
        (prisma.householdMember.count as any).mockResolvedValue(2);
        (prisma.householdMember.delete as any).mockResolvedValue({});
        const req = { user: { userId: 'u2' } } as any;
        await householdController.leaveHousehold(req, res);
        expect(prisma.householdMember.delete).toHaveBeenCalledWith({ where: { id: 'm2' } });
    });
});

describe('removeMember', () => {
    it('blokuje nie-właściciela', async () => {
        (prisma.householdMember.findUnique as any).mockResolvedValue({ id: 'm2', householdId: 'h1', role: 'MEMBER' });
        const req = { user: { userId: 'u2' }, params: { memberId: 'm3' } } as any;
        await householdController.removeMember(req, res);
        expect(statusMock).toHaveBeenCalledWith(403);
    });

    it('właściciel nie usuwa samego siebie', async () => {
        (prisma.householdMember.findUnique as any)
            .mockResolvedValueOnce({ id: 'm1', householdId: 'h1', role: 'OWNER' }) // me
            .mockResolvedValueOnce({ id: 'm1', householdId: 'h1', role: 'OWNER' }); // target = self
        const req = { user: { userId: 'u1' }, params: { memberId: 'm1' } } as any;
        await householdController.removeMember(req, res);
        expect(statusMock).toHaveBeenCalledWith(400);
    });

    it('właściciel usuwa innego członka', async () => {
        (prisma.householdMember.findUnique as any)
            .mockResolvedValueOnce({ id: 'm1', householdId: 'h1', role: 'OWNER' }) // me
            .mockResolvedValueOnce({ id: 'm2', householdId: 'h1', userId: 'u2', role: 'MEMBER' }); // target
        (prisma.householdMember.delete as any).mockResolvedValue({});
        const req = { user: { userId: 'u1' }, params: { memberId: 'm2' } } as any;
        await householdController.removeMember(req, res);
        expect(prisma.householdMember.delete).toHaveBeenCalledWith({ where: { id: 'm2' } });
    });
});
