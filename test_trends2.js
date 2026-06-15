process.env.DATABASE_URL = "file:/opt/ppsspp-adhoc-server/database.db";
const { PrismaClient } = require('./webapp/src/generated/prisma');
const prisma = new PrismaClient();

async function test() {
    const history = await prisma.playerHistory.findMany({
        where: {
            joinedAt: {
                gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            }
        }
    });
    console.log("HISTORY:", history);
}
test().catch(console.error).finally(() => prisma.$disconnect());
