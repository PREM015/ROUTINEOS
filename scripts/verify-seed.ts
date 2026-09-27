import { PrismaClient } from '@/generated/prisma';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set');
}

const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function verify() {
  const dts = await prisma.dayTypeDefinition.findMany();
  console.log('DayTypeDefinitions:', JSON.stringify(dts, null, 2));

  const templates = await prisma.routineTemplate.findMany({ 
    select: { id: true, name: true, dayType: true, dayTypeId: true } 
  });
  console.log('Templates:', JSON.stringify(templates, null, 2));

  const exceptions = await prisma.routineException.findMany({ 
    select: { id: true, date: true, dayType: true, dayTypeId: true } 
  });
  console.log('Exceptions:', JSON.stringify(exceptions, null, 2));

  await prisma.$disconnect();
}

verify().catch(console.error);