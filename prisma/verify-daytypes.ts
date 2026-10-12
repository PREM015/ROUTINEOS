import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma";

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });

async function main() {
  const user = await prisma.user.findUniqueOrThrow({ where: { email: "kumarrahuljmp8@gmail.com" } });

  const defs = await prisma.dayTypeDefinition.findMany({
    where: { userId: user.id },
    include: { routineTemplates: { include: { _count: { select: { blocks: true } } } } },
    orderBy: { sortOrder: "asc" },
  });

  console.log("=== DayTypeDefinitions:", defs.length, "===");
  for (const d of defs) {
    const t = d.routineTemplates[0];
    console.log(
      `${d.sortOrder} | ${d.name.padEnd(26)} | slug=${d.slug.padEnd(22)} | ${d.color} ${d.icon} | default=${d.isDefault} archived=${d.isArchived} | template=${t?.id ?? "NONE"} blocks=${t?._count.blocks ?? 0}`
    );
  }

  console.log("\nTotal blocks:", await prisma.routineBlock.count({ where: { template: { userId: user.id } } }));
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());