import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Clearing group assignments from users...');
  await prisma.user.updateMany({
    data: { groupId: null }
  });

  console.log('Deleting all lines (since they require a group)...');
  await prisma.userLineAssignment.deleteMany({});
  await prisma.conversation.deleteMany({});
  await prisma.wappiLine.deleteMany({});

  console.log('Deleting all groups...');
  const result = await prisma.group.deleteMany({});
  console.log(`Deleted ${result.count} groups.`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
