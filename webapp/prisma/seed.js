const { PrismaClient } = require('../src/generated/prisma');
const fs = require('fs');
const path = require('path');

const prisma = new PrismaClient();

async function main() {
  const jsonPath = path.join(__dirname, 'productids.json');
  if (!fs.existsSync(jsonPath)) {
    console.log('productids.json not found, skipping seed.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  console.log(`📦 Seeding ${data.length} games into the database using Prisma...`);

  const chunks = [];
  // Split into chunks of 100
  for (let i = 0; i < data.length; i += 100) {
    chunks.push(data.slice(i, i + 100));
  }

  for (const chunk of chunks) {
    const placeholders = chunk.map(() => '(?, ?)').join(', ');
    const values = chunk.flatMap(c => [c.id, c.name]);
    
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO productids (id, name) VALUES ${placeholders}`,
      ...values
    );
  }

  console.log('✅ Seeding complete!');
}

main()
  .catch((e) => {
    console.error('Failed to seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
