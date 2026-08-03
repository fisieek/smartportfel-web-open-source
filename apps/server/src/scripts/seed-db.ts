import { seedCategories } from '../utils/seed';
import prisma from '../lib/prisma';

async function main() {
    console.log('--- Database Seeding Started ---');
    try {
        await seedCategories();
        console.log('--- Database Seeding Completed Successfully ---');
    } catch (error) {
        console.error('--- Database Seeding Failed ---');
        console.error(error);
        process.exit(1);
    } finally {
        await prisma.$disconnect();
    }
}

main();
