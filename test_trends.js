const { PrismaClient } = require('./webapp/src/generated/prisma');
const prisma = new PrismaClient();

async function test() {
    const history = await prisma.playerHistory.findMany();
    console.log(history);
}
test().catch(console.error).finally(() => prisma.$disconnect());
