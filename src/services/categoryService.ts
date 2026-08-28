import {
  CategoryRepository,
  type Category,
} from "../db/repositories/categoryRepository";

export class CategoryService {
  constructor(private readonly categories: CategoryRepository) {}

  async findAll(): Promise<Category[]> {
    return this.categories.findAll();
  }

  async create(name: string): Promise<Category> {
    return this.categories.create(name);
  }

  async rename(id: number, name: string): Promise<Category | null> {
    return this.categories.update(id, name);
  }

  async delete(id: number): Promise<boolean> {
    return this.categories.delete(id);
  }

  async reorder(orderedIds: number[]): Promise<void> {
    return this.categories.reorder(orderedIds);
  }
}
