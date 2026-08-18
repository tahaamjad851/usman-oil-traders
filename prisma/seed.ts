import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../lib/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL must be configured before seeding the database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(databaseUrl),
});

const brands = [
  { name: "ZIC", slug: "zic" },
  { name: "Shell", slug: "shell" },
  { name: "Caltex", slug: "caltex" },
  { name: "Total", slug: "total" },
  { name: "PSO", slug: "pso" },
  { name: "Honda", slug: "honda" },
  { name: "Havoline", slug: "havoline" },
  { name: "Suzuki", slug: "suzuki" },
];

async function main() {
  const engineOils = await prisma.category.upsert({
    where: { slug: "engine-oils" },
    update: { name: "Engine Oils", isActive: true },
    create: { name: "Engine Oils", slug: "engine-oils" },
  });

  await Promise.all([
    prisma.category.upsert({
      where: { slug: "car-engine-oil" },
      update: { name: "Car Engine Oil", parentId: engineOils.id, isActive: true },
      create: {
        name: "Car Engine Oil",
        slug: "car-engine-oil",
        parentId: engineOils.id,
      },
    }),
    prisma.category.upsert({
      where: { slug: "motorcycle-engine-oil" },
      update: {
        name: "Motorcycle Engine Oil",
        parentId: engineOils.id,
        isActive: true,
      },
      create: {
        name: "Motorcycle Engine Oil",
        slug: "motorcycle-engine-oil",
        parentId: engineOils.id,
      },
    }),
    prisma.category.upsert({
      where: { slug: "tractor-engine-oil" },
      update: {
        name: "Tractor Engine Oil",
        parentId: engineOils.id,
        isActive: true,
      },
      create: {
        name: "Tractor Engine Oil",
        slug: "tractor-engine-oil",
        parentId: engineOils.id,
      },
    }),
    prisma.category.upsert({
      where: { slug: "motorcycle-parts" },
      update: { name: "Motorcycle Parts", parentId: null, isActive: true },
      create: { name: "Motorcycle Parts", slug: "motorcycle-parts" },
    }),
    prisma.category.upsert({
      where: { slug: "tractor-parts" },
      update: { name: "Tractor Parts", parentId: null, isActive: true },
      create: { name: "Tractor Parts", slug: "tractor-parts" },
    }),
  ]);

  await Promise.all(
    brands.map((brand) =>
      prisma.brand.upsert({
        where: { slug: brand.slug },
        update: { name: brand.name, isActive: true },
        create: brand,
      }),
    ),
  );
}

main()
  .then(() => console.info("Phase 2 categories and brands seeded."))
  .finally(async () => {
    await prisma.$disconnect();
  });
