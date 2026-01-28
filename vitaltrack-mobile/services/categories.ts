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
    return api.get<CategoriesWithCountsResponse>('/categories/with-counts');
  },

  /**
   * Get single category by ID
   */
  async getById(id: string): Promise<Category> {
    return api.get<Category>(`/categories/${id}`);
  },

  /**
   * Create new category
   */
  async create(data: CreateCategoryRequest): Promise<Category> {
    return api.post<Category>('/categories', data);
  },

  /**
   * Update existing category
   */
  async update(id: string, data: UpdateCategoryRequest): Promise<Category> {
    return api.put<Category>(`/categories/${id}`, data);
  },

  /**
   * Delete category
   */
  async delete(id: string): Promise<{ message: string }> {
    return api.delete<{ message: string }>(`/categories/${id}`);
  },
};

export type { CreateCategoryRequest, UpdateCategoryRequest, CategoryWithCount };
