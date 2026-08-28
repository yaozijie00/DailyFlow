import {
  CategoryRepository,
  type Category,
} from "../db/repositories/categoryRepository";

export class CategoryService {
  constructor(private readonly categories: CategoryRepository) {}

  async findAll(): Promise<Category[]> {
    return this.categories.findAll();
  }
}
