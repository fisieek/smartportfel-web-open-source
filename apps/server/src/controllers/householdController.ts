import { Response } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/authMiddleware';
import { audit } from '../utils/auditLog';
import { sendHouseholdInvitationEmail } from '../utils/email';
import { captureServerError } from '../lib/reportError';

const INVITATION_TTL_DAYS = 7;

// Wspólny kształt odpowiedzi „moje gospodarstwo": członkowie + (dla właściciela) oczekujące zaproszenia
async function loadHousehold(householdId: string, includeInvitations: boolean) {
    return prisma.household.findUnique({
        where: { id: householdId },
        include: {
            members: {
                include: { user: { select: { id: true, username: true, email: true } } },
                orderBy: { joinedAt: 'asc' }
            },
            invitations: includeInvitations
                ? { where: { status: 'PENDING' }, orderBy: { createdAt: 'desc' } }
                : false
        }
    });
}

// GET /api/household — gospodarstwo bieżącego użytkownika (lub null) + oczekujące zaproszenia do niego
export const getMyHousehold = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const membership = await prisma.householdMember.findUnique({ where: { userId } });

        let pendingForMe: any[] = [];
        const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (me?.email) {
            pendingForMe = await prisma.householdInvitation.findMany({
                where: { email: me.email, status: 'PENDING', expiresAt: { gt: new Date() } },
                include: { household: { select: { name: true } }, invitedBy: { select: { username: true } } },
                orderBy: { createdAt: 'desc' }
            });
        }

        if (!membership) {
            res.json({ household: null, role: null, pendingInvitations: pendingForMe });
            return;
        }

        const household = await loadHousehold(membership.householdId, membership.role === 'OWNER');
        res.json({ household, role: membership.role, pendingInvitations: pendingForMe });
    } catch (error) {
        captureServerError(error, req, 'Błąd pobierania gospodarstwa:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// POST /api/household — utworzenie gospodarstwa; twórca zostaje właścicielem
export const createHousehold = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const name = (req.body?.name || '').trim();
        if (!name) {
            res.status(400).json({ error: 'Nazwa gospodarstwa jest wymagana' });
            return;
        }

        const existing = await prisma.householdMember.findUnique({ where: { userId } });
        if (existing) {
            res.status(409).json({ error: 'Należysz już do gospodarstwa domowego' });
            return;
        }

        const household = await prisma.household.create({
            data: {
                name,
                members: { create: { userId, role: 'OWNER' } }
            },
            include: {
                members: { include: { user: { select: { id: true, username: true, email: true } } } }
            }
        });

        await audit('household.created', { userId, resource: household.id, req });
        res.status(201).json({ household, role: 'OWNER', pendingInvitations: [] });
    } catch (error) {
        captureServerError(error, req, 'Błąd tworzenia gospodarstwa:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// POST /api/household/invite — zaproszenie po e-mailu (tylko właściciel)
export const inviteMember = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const email = (req.body?.email || '').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            res.status(400).json({ error: 'Podaj prawidłowy adres e-mail' });
            return;
        }

        const membership = await prisma.householdMember.findUnique({ where: { userId } });
        if (!membership) {
            res.status(404).json({ error: 'Nie należysz do żadnego gospodarstwa' });
            return;
        }
        if (membership.role !== 'OWNER') {
            res.status(403).json({ error: 'Tylko właściciel może zapraszać członków' });
            return;
        }

        const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, username: true } });
        if (me?.email?.toLowerCase() === email) {
            res.status(400).json({ error: 'Nie możesz zaprosić samego siebie' });
            return;
        }

        // Jeśli zapraszany ma konto i już należy do gospodarstwa — blokujemy
        const invitee = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        if (invitee) {
            const inviteeMembership = await prisma.householdMember.findUnique({ where: { userId: invitee.id } });
            if (inviteeMembership) {
                res.status(409).json({ error: 'Ta osoba należy już do gospodarstwa domowego' });
                return;
            }
        }

        // Brak duplikatu oczekującego zaproszenia
        const existingInvite = await prisma.householdInvitation.findFirst({
            where: { householdId: membership.householdId, email, status: 'PENDING', expiresAt: { gt: new Date() } }
        });
        if (existingInvite) {
            res.status(409).json({ error: 'To zaproszenie zostało już wysłane' });
            return;
        }

        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000);
        const invitation = await prisma.householdInvitation.create({
            data: { householdId: membership.householdId, email, token, invitedById: userId, expiresAt }
        });

        const household = await prisma.household.findUnique({ where: { id: membership.householdId }, select: { name: true } });
        await sendHouseholdInvitationEmail(email, token, me?.username || 'Ktoś', household?.name || 'Wspólny budżet');
        await audit('household.invited', { userId, resource: invitation.id, req });

        res.status(201).json({ id: invitation.id, email, expiresAt });
    } catch (error) {
        captureServerError(error, req, 'Błąd zapraszania do gospodarstwa:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// GET /api/household/invitation/:token — podgląd zaproszenia (publiczny; token = sekret).
// Zwraca minimum do wyświetlenia strony zaproszenia, bez ujawniania danych wrażliwych.
export const getInvitationByToken = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const { token } = req.params;
        const invitation = await prisma.householdInvitation.findUnique({
            where: { token },
            include: { household: { select: { name: true } }, invitedBy: { select: { username: true } } }
        });

        if (!invitation) {
            res.json({ valid: false, reason: 'NOT_FOUND' });
            return;
        }
        const expired = invitation.expiresAt < new Date();
        res.json({
            valid: invitation.status === 'PENDING' && !expired,
            status: invitation.status,
            expired,
            email: invitation.email,
            householdName: invitation.household.name,
            inviterName: invitation.invitedBy.username
        });
    } catch (error) {
        captureServerError(error, req, 'Błąd podglądu zaproszenia:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// POST /api/household/accept — przyjęcie zaproszenia po tokenie
export const acceptInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const token = (req.body?.token || '').trim();
        if (!token) {
            res.status(400).json({ error: 'Brak tokenu zaproszenia' });
            return;
        }

        const existing = await prisma.householdMember.findUnique({ where: { userId } });
        if (existing) {
            res.status(409).json({ error: 'Należysz już do gospodarstwa domowego' });
            return;
        }

        const invitation = await prisma.householdInvitation.findUnique({ where: { token } });
        if (!invitation || invitation.status !== 'PENDING' || invitation.expiresAt < new Date()) {
            res.status(404).json({ error: 'Zaproszenie jest nieprawidłowe lub wygasło' });
            return;
        }

        const me = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!me || me.email.toLowerCase() !== invitation.email.toLowerCase()) {
            res.status(403).json({ error: 'To zaproszenie zostało wysłane na inny adres e-mail' });
            return;
        }

        await prisma.$transaction([
            prisma.householdMember.create({ data: { householdId: invitation.householdId, userId, role: 'MEMBER' } }),
            // Zamykamy WSZYSTKIE oczekujące zaproszenia dla tej pary (gospodarstwo, email),
            // nie tylko ten jeden token — inaczej ewentualne duplikaty zostają jako „oczekuje".
            prisma.householdInvitation.updateMany({
                where: { householdId: invitation.householdId, email: invitation.email, status: 'PENDING' },
                data: { status: 'ACCEPTED' }
            })
        ]);

        await audit('household.invitation_accepted', { userId, resource: invitation.householdId, req });
        const household = await loadHousehold(invitation.householdId, false);
        res.json({ household, role: 'MEMBER' });
    } catch (error) {
        captureServerError(error, req, 'Błąd przyjmowania zaproszenia:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// POST /api/household/decline — odrzucenie zaproszenia po tokenie
export const declineInvitation = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const token = (req.body?.token || '').trim();
        if (!token) {
            res.status(400).json({ error: 'Brak tokenu zaproszenia' });
            return;
        }

        const invitation = await prisma.householdInvitation.findUnique({ where: { token } });
        if (!invitation || invitation.status !== 'PENDING') {
            res.status(404).json({ error: 'Zaproszenie jest nieprawidłowe' });
            return;
        }

        await prisma.householdInvitation.update({ where: { id: invitation.id }, data: { status: 'DECLINED' } });
        await audit('household.invitation_declined', { userId, resource: invitation.householdId, req });
        res.json({ message: 'Zaproszenie odrzucone' });
    } catch (error) {
        captureServerError(error, req, 'Błąd odrzucania zaproszenia:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// POST /api/household/leave — opuszczenie gospodarstwa.
// Właściciel sam w gospodarstwie => usuwamy całe gospodarstwo. Z innymi członkami => musi najpierw ich usunąć.
export const leaveHousehold = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const membership = await prisma.householdMember.findUnique({ where: { userId } });
        if (!membership) {
            res.status(404).json({ error: 'Nie należysz do żadnego gospodarstwa' });
            return;
        }

        const memberCount = await prisma.householdMember.count({ where: { householdId: membership.householdId } });

        if (membership.role === 'OWNER') {
            if (memberCount > 1) {
                res.status(409).json({ error: 'Najpierw usuń pozostałych członków lub przekaż własność' });
                return;
            }
            // Właściciel jako jedyny — kasujemy gospodarstwo (kaskadowo członkostwo i zaproszenia)
            await prisma.household.delete({ where: { id: membership.householdId } });
            await audit('household.deleted', { userId, resource: membership.householdId, req });
            res.json({ message: 'Gospodarstwo zostało usunięte' });
            return;
        }

        await prisma.householdMember.delete({ where: { id: membership.id } });
        await audit('household.member_left', { userId, resource: membership.householdId, req });
        res.json({ message: 'Opuściłeś gospodarstwo' });
    } catch (error) {
        captureServerError(error, req, 'Błąd opuszczania gospodarstwa:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};

// DELETE /api/household/members/:memberId — usunięcie członka (tylko właściciel)
export const removeMember = async (req: AuthRequest, res: Response): Promise<void> => {
    try {
        const userId = req.user!.userId;
        const { memberId } = req.params;

        const membership = await prisma.householdMember.findUnique({ where: { userId } });
        if (!membership || membership.role !== 'OWNER') {
            res.status(403).json({ error: 'Tylko właściciel może usuwać członków' });
            return;
        }

        const target = await prisma.householdMember.findUnique({ where: { id: memberId } });
        if (!target || target.householdId !== membership.householdId) {
            res.status(404).json({ error: 'Członek nie znaleziony' });
            return;
        }
        if (target.id === membership.id) {
            res.status(400).json({ error: 'Nie możesz usunąć samego siebie — użyj opcji opuszczenia' });
            return;
        }

        await prisma.householdMember.delete({ where: { id: target.id } });
        await audit('household.member_removed', { userId, resource: target.userId, req });
        res.json({ message: 'Członek został usunięty' });
    } catch (error) {
        captureServerError(error, req, 'Błąd usuwania członka:');
        res.status(500).json({ error: 'Błąd serwera' });
    }
};
