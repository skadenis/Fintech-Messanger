import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import {
  MessageDirection,
  MessageSource,
  MessengerType,
  Role,
} from '@fintech/shared';

const prisma = new PrismaClient();

async function main() {
  const salesGroup = await prisma.group.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Отдел продаж',
    },
  });

  const supportGroup = await prisma.group.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Отдел сопровождения',
    },
  });

  const passwordHash = await bcrypt.hash('admin123', 10);

  const superAdmin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash,
      name: 'Super Admin',
      role: Role.SUPER_ADMIN,
    },
  });

  const salesAdmin = await prisma.user.upsert({
    where: { email: 'sales-admin@example.com' },
    update: {
      bitrixPortalId: 'portal1',
    },
    create: {
      email: 'sales-admin@example.com',
      passwordHash: await bcrypt.hash('sales123', 10),
      name: 'Руководитель продаж',
      role: Role.GROUP_ADMIN,
      groupId: salesGroup.id,
      bitrixPortalId: 'portal1',
    },
  });

  const operator = await prisma.user.upsert({
    where: { email: 'manager@example.com' },
    update: {},
    create: {
      email: 'manager@example.com',
      passwordHash: await bcrypt.hash('manager123', 10),
      name: 'Менеджер Иван',
      role: Role.OPERATOR,
      groupId: salesGroup.id,
      bitrixUserId: '123',
      bitrixPortalId: 'portal1',
    },
  });

  const waLine = await prisma.wappiLine.upsert({
    where: { id: '00000000-0000-0000-0000-000000000101' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000101',
      name: 'WhatsApp продажи',
      messengerType: MessengerType.WHATSAPP,
      wappiProfileId: 'demo-profile-wa',
      wappiApiToken: 'demo-token',
      groupId: salesGroup.id,
      status: 'online',
    },
  });

  const tgLine = await prisma.wappiLine.upsert({
    where: { id: '00000000-0000-0000-0000-000000000102' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000102',
      name: 'Telegram продажи',
      messengerType: MessengerType.TELEGRAM,
      wappiProfileId: 'demo-profile-tg',
      wappiApiToken: 'demo-token',
      groupId: salesGroup.id,
      status: 'online',
    },
  });

  const maxLine = await prisma.wappiLine.upsert({
    where: { id: '00000000-0000-0000-0000-000000000103' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000103',
      name: 'MAX продажи',
      messengerType: MessengerType.MAX,
      wappiProfileId: 'demo-profile-max',
      wappiApiToken: 'demo-token',
      groupId: salesGroup.id,
      status: 'online',
    },
  });

  for (const lineId of [waLine.id, tgLine.id, maxLine.id]) {
    await prisma.userLineAssignment.upsert({
      where: {
        userId_lineId: {
          userId: operator.id,
          lineId,
        },
      },
      update: {},
      create: {
        userId: operator.id,
        lineId,
      },
    });
  }

  const conversation = await prisma.conversation.upsert({
    where: {
      lineId_wappiChatId: {
        lineId: waLine.id,
        wappiChatId: '79055185834@c.us',
      },
    },
    update: {
      contactName: 'Денис Скачко',
      contactPhone: '79055185834',
      bitrixContactId: '8',
    },
    create: {
      lineId: waLine.id,
      wappiChatId: '79055185834@c.us',
      contactName: 'Денис Скачко',
      contactPhone: '79055185834',
      bitrixContactId: '8',
    },
  });

  await prisma.message.deleteMany({ where: { conversationId: conversation.id } });

  const baseTime = Date.now() - 1000 * 60 * 30;

  await prisma.message.createMany({
    data: [
      {
        conversationId: conversation.id,
        direction: MessageDirection.INCOMING,
        source: MessageSource.WAPPI,
        body: 'Здравствуйте, хочу узнать о продукте',
        type: 'text',
        status: 'DELIVERED',
        createdAt: new Date(baseTime),
      },
      {
        conversationId: conversation.id,
        direction: MessageDirection.OUTGOING,
        source: MessageSource.PANEL,
        body: 'Добрый день! Чем могу помочь?',
        type: 'text',
        status: 'DELIVERED',
        senderUserId: operator.id,
        createdAt: new Date(baseTime + 1000 * 60),
      },
      {
        conversationId: conversation.id,
        direction: MessageDirection.INCOMING,
        source: MessageSource.WAPPI,
        body: 'Страница паспорта',
        caption: 'Страница паспорта',
        type: 'image',
        mimeType: 'image/jpeg',
        mediaUrl: 'https://picsum.photos/seed/passport/480/320',
        status: 'DELIVERED',
        createdAt: new Date(baseTime + 1000 * 60 * 2),
      },
      {
        conversationId: conversation.id,
        direction: MessageDirection.INCOMING,
        source: MessageSource.WAPPI,
        body: 'Голосовое сообщение',
        type: 'ptt',
        mimeType: 'audio/ogg',
        status: 'DELIVERED',
        createdAt: new Date(baseTime + 1000 * 60 * 3),
      },
      {
        conversationId: conversation.id,
        direction: MessageDirection.INCOMING,
        source: MessageSource.WAPPI,
        body: 'Видео с объекта',
        caption: 'Видео с объекта',
        type: 'video',
        mimeType: 'video/mp4',
        mediaUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
        status: 'DELIVERED',
        createdAt: new Date(baseTime + 1000 * 60 * 4),
      },
      {
        conversationId: conversation.id,
        direction: MessageDirection.INCOMING,
        source: MessageSource.WAPPI,
        body: 'Кружок',
        type: 'video_note',
        mimeType: 'video/mp4',
        mediaUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm',
        status: 'DELIVERED',
        createdAt: new Date(baseTime + 1000 * 60 * 5),
      },
      {
        conversationId: conversation.id,
        direction: MessageDirection.OUTGOING,
        source: MessageSource.PANEL,
        body: 'Презентация продукта',
        caption: 'Презентация продукта',
        fileName: 'presentation.pptx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        type: 'document',
        status: 'DELIVERED',
        senderUserId: operator.id,
        createdAt: new Date(baseTime + 1000 * 60 * 6),
      },
    ],
  });

  await prisma.conversation.update({
    where: { id: conversation.id },
    data: { lastMessageAt: new Date(baseTime + 1000 * 60 * 6) },
  });

  console.log('Seed completed:', {
    superAdmin: superAdmin.email,
    salesAdmin: salesAdmin.email,
    operator: operator.email,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
