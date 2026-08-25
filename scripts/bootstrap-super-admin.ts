import "dotenv/config";

import { hashPassword } from "@/lib/auth/password";
import { prisma } from "@/lib/db";

async function main() {
  const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim();
  const username = process.env.BOOTSTRAP_ADMIN_USERNAME?.trim().toLowerCase();
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;

  if (!name || !username || !password) {
    throw new Error(
      "Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_USERNAME, and BOOTSTRAP_ADMIN_PASSWORD before running this command.",
    );
  }

  if (password.length < 10 || password.toLowerCase() === username) {
    throw new Error("The bootstrap password does not meet the password policy.");
  }

  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    throw new Error("A user with this bootstrap username already exists.");
  }

  await prisma.user.create({
    data: {
      name,
      username,
      passwordHash: await hashPassword(password),
      role: "SUPER_ADMIN",
    },
  });

  await prisma.$disconnect();
  console.info("Super admin created.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
