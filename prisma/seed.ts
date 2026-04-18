import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.ADMIN_PASSWORD ?? "changeme";
  const partnerEmail = process.env.PARTNER_EMAIL ?? "partner@example.com";
  const partnerPassword = process.env.PARTNER_PASSWORD ?? "changeme";

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      password: await bcrypt.hash(adminPassword, 10),
      name: "מנהל",
      role: Role.ADMIN,
    },
  });

  await prisma.user.upsert({
    where: { email: partnerEmail },
    update: {},
    create: {
      email: partnerEmail,
      password: await bcrypt.hash(partnerPassword, 10),
      name: "שותף",
      role: Role.PARTNER,
    },
  });

  await prisma.setting.upsert({
    where: { key: "boi_base_rate" },
    update: {},
    create: { key: "boi_base_rate", value: process.env.BOI_BASE_RATE_FALLBACK ?? "4.5" },
  });

  await prisma.setting.upsert({
    where: { key: "boi_base_rate_updated" },
    update: {},
    create: { key: "boi_base_rate_updated", value: new Date().toISOString() },
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
