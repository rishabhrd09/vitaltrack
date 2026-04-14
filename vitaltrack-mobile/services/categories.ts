/**
 * VitalTrack Mobile - Categories API Service
 * CRUD operations for categories
 */

import { api } from './api';
import type { Category } from '@/types';

// Response types
interface CategoriesListResponse {
  categories: Category[];
  total: number;
}

interface CategoryWithCount extends Category {
  itemCount: number;
}

interface CategoriesWithCountsResponse {
  categories: CategoryWithCount[];
  total: number;
}

// Create category request
interface CreateCategoryRequest {
  name: string;
  description?: string;
  displayOrder?: number;
}

// Update category request
interface UpdateCategoryRequest {
  name?: string;
  description?: string;
  displayOrder?: number;
}

export const categoryService = {
  /**
   * Get all categories
   */
  async getAll(): Promise<CategoriesListResponse> {
    return api.get<CategoriesListResponse>('/categories');
  },

  /**
   * Get all categories with item counts
   */
  async getWithCounts(): Promise<CategoriesWithCountsResponse> {
    const categories = await api.get<CategoryWithCount[]>('/categories/with-counts');
    return { categories, total: categories.length };
  },

  /**
   * Get single category by ID
   */
  async getById(id: string): Promise<Category> {
    return api.get<Category>(`/categories/${id}`);
  },

  /**
   * Create new category
   * NOTE: backend CategoryCreate uses snake_case (no aliases),
   * so we translate displayOrder -> display_order at the API boundary.
   */
  async create(data: CreateCategoryRequest): Promise<Category> {
    return api.post<Category>('/categories', {
      name: data.name,
      description: data.description,
      display_order: data.displayOrder ?? 0,
    });
  },

  /**
   * Update existing category
   * NOTE: backend CategoryUpdate uses snake_case (no aliases).
   */
  async update(id: string, data: UpdateCategoryRequest): Promise<Category> {
    const payload: Record<string, unknown> = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.description !== undefined) payload.description = data.description;
    if (data.displayOrder !== undefined) payload.display_order = data.displayOrder;
    return api.put<Category>(`/categories/${id}`, payload);
  },

  /**
   * Delete category
   */
  async delete(id: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/categories/${id}`);
  },
};

export type { CreateCategoryRequest, UpdateCategoryRequest, CategoryWithCount };
