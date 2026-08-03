import type { Store, Options, IncrementResponse } from 'express-rate-limit';
import prisma from '../lib/prisma';
import { captureServerError } from '../lib/reportError';

/**
 * Store dla express-rate-limit oparty o Postgres (tabela rate_limit_entries).
 * W środowisku serverless domyślny MemoryStore resetuje się per inwokacja i nie jest
 * współdzielony między instancjami — liczniki muszą żyć w bazie (audyt B1).
 *
 * Inkrement to JEDEN atomowy upsert (INSERT ... ON CONFLICT), więc równoległe
 * żądania z różnych instancji nie gubią zliczeń i nie potrzebują transakcji.
 */
export class PrismaRateLimitStore implements Store {
    // Klucze żyją w bazie, nie w pamięci procesu — bez tego express-rate-limit
    // ostrzega o podwójnym zliczaniu przy współdzieleniu instancji store'a.
    localKeys = false;

    private windowMs = 60_000;

    /** prefix rozdziela kubełki poszczególnych limiterów (np. "auth", "email", "mcp");
     *  publiczny, bo interfejs Store deklaruje opcjonalne pole `prefix` */
    constructor(readonly prefix: string) { }

    init(options: Options): void {
        this.windowMs = options.windowMs;
    }

    private fullKey(key: string): string {
        return `${this.prefix}:${key}`;
    }

    async increment(key: string): Promise<IncrementResponse> {
        try {
            const windowSecs = this.windowMs / 1000;
            const rows = await prisma.$queryRaw<{ hits: number; resetAt: Date }[]>`
                INSERT INTO "rate_limit_entries" ("key", "hits", "resetAt")
                VALUES (${this.fullKey(key)}, 1, now() + make_interval(secs => ${windowSecs}))
                ON CONFLICT ("key") DO UPDATE SET
                    "hits" = CASE WHEN "rate_limit_entries"."resetAt" <= now()
                        THEN 1
                        ELSE "rate_limit_entries"."hits" + 1 END,
                    "resetAt" = CASE WHEN "rate_limit_entries"."resetAt" <= now()
                        THEN now() + make_interval(secs => ${windowSecs})
                        ELSE "rate_limit_entries"."resetAt" END
                RETURNING "hits", "resetAt"`;
            return { totalHits: rows[0].hits, resetTime: rows[0].resetAt };
        } catch (error) {
            // Fail-open: awaria bazy nie może odciąć wszystkim logowania.
            captureServerError(error, undefined, `[RateLimit] increment failed (${this.prefix})`);
            return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
        }
    }

    async decrement(key: string): Promise<void> {
        try {
            await prisma.rateLimitEntry.updateMany({
                where: { key: this.fullKey(key), hits: { gt: 0 } },
                data: { hits: { decrement: 1 } },
            });
        } catch (error) {
            captureServerError(error, undefined, `[RateLimit] decrement failed (${this.prefix})`);
        }
    }

    async resetKey(key: string): Promise<void> {
        try {
            await prisma.rateLimitEntry.deleteMany({ where: { key: this.fullKey(key) } });
        } catch (error) {
            captureServerError(error, undefined, `[RateLimit] resetKey failed (${this.prefix})`);
        }
    }
}
