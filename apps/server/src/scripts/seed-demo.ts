import crypto from 'crypto';
import prisma from '../lib/prisma';
import bcrypt from 'bcryptjs';

// Dane demo konfigurowane przez env — bez prawdziwych adresów i haseł w repo.
// Skrypt tylko do środowisk lokalnych/testowych.
const DEMO_EMAIL = process.env.DEMO_USER_EMAIL || 'demo@example.com';
const DEMO_USERNAME = process.env.DEMO_USER_NAME || 'demo';
const DEMO_PASSWORD = process.env.DEMO_USER_PASSWORD || crypto.randomBytes(9).toString('base64url');

async function main() {
    if (process.env.NODE_ENV === 'production') {
        console.error('seed-demo nie może być uruchamiany na produkcji.');
        process.exit(1);
    }

    console.log('--- Demo Data Seeding Started ---');
    try {
        // 1. Create User
        const hashedPassword = await bcrypt.hash(DEMO_PASSWORD, 10);
        const user = await prisma.user.upsert({
            where: { email: DEMO_EMAIL },
            update: {
                password: hashedPassword,
                isEmailVerified: true
            },
            create: {
                email: DEMO_EMAIL,
                username: DEMO_USERNAME,
                password: hashedPassword,
                isEmailVerified: true
            }
        });
        console.log(`User created/updated: ${user.email} (ID: ${user.id})`);

        // 2. Create Personal Account
        const account = await prisma.personalAccount.create({
            data: {
                userId: user.id,
                name: 'Konto Główne',
                bank: 'mBank',
                balance: 5000,
                isMain: true
            }
        });
        console.log(`Account created: ${account.name}`);

        // 3. Create some sample Categories and Stores if they don't exist (already handled by seed-db but for safety)
        const groceryCat = await prisma.category.findFirst({ where: { name: 'Sklepy spożywcze' } });
        if (groceryCat) {
            await prisma.expense.create({
                data: {
                    userId: user.id,
                    amount: 150.50,
                    description: 'Zakupy spożywcze',
                    categoryId: groceryCat.id,
                    personalAccountId: account.id,
                    transactionDate: new Date(),
                    store: 'Biedronka'
                }
            });
            console.log('Sample expense created');
        }

        console.log('--- Demo Data Seeding Completed Successfully ---');
        console.log(`\nZaloguj się używając:\nEmail: ${DEMO_EMAIL}\nHasło: ${process.env.DEMO_USER_PASSWORD ? '(z env DEMO_USER_PASSWORD)' : DEMO_PASSWORD}`);

    } catch (error) {
        console.error('--- Demo Data Seeding Failed ---');
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
