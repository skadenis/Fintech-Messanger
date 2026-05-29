import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const lines = await prisma.wappiLine.findMany();
  for (const line of lines) {
    console.log(`Line ${line.id}: name=${line.name}, wappiProfileId=${line.wappiProfileId}, messengerType=${line.messengerType}`);
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
