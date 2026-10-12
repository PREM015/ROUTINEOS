import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "kumarrahuljmp8@gmail.com" } });
  const date = "2026-10-11";
  const hackathonDayId = "cmv3vicu4006qicugkjklq60i";

  // Check existing exception
  const existing = await prisma.routineException.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });

  console.log("Existing exception:", existing);

  if (existing) {
    console.log("Updating existing exception...");
    await prisma.routineException.update({
      where: { userId_date: { userId: user.id, date } },
      data: {
        dayType: "CUSTOM",
        dayTypeId: hackathonDayId,
        templateId: null,
        note: "Hackathon Day",
      },
    });
    console.log("Updated exception to Hackathon Day");
  } else {
    console.log("Creating new exception...");
    await prisma.routineException.create({
      data: {
        userId: user.id,
        date,
        dayType: "CUSTOM",
        dayTypeId: hackathonDayId,
        note: "Hackathon Day",
      },
    });
    console.log("Created exception for Hackathon Day on 2026-10-11");
  }

  // Verify
  const verify = await prisma.routineException.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });
  console.log("Verified exception:", verify);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());