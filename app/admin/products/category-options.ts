export type CategoryOption = { id: string; label: string };

type CategoryWithChildren = {
  id: string;
  name: string;
  children?: { id: string; name: string }[];
};

export function flattenCategories(categories: CategoryWithChildren[]): CategoryOption[] {
  return categories.flatMap((category) => [
    { id: category.id, label: category.name },
    ...(category.children ?? []).map((child) => ({ id: child.id, label: `— ${child.name}` })),
  ]);
}
