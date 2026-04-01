import type {
  SiftlyBookmarkItemApiResponse,
  SiftlyCategory
} from './SiftlyBookmark.ts';

import { SiftlyBookmark } from './SiftlyBookmark.ts';

export interface SiftlyStatsApiResponse {
  bookmarkCount: number;
  likeCount: number;
  recentBookmarks: SiftlyBookmarkItemApiResponse[];
  topCategories: SiftlyTopCategory[];
  totalBookmarks: number;
  totalCategories: number;
  totalMedia: number;
  uncategorizedCount: number;
}

export interface SiftlyTopCategory {
  color: string;
  count: number;
  name: string;
  slug: string;
}

export class SiftlyStats {
  public readonly bookmarkCount: number;
  public readonly likeCount: number;
  public readonly recentBookmarks: SiftlyBookmark[];
  public readonly topCategories: SiftlyTopCategory[];
  public readonly totalBookmarks: number;
  public readonly totalCategories: number;
  public readonly totalMedia: number;
  public readonly uncategorizedCount: number;

  public get mostUsedCategory(): null | SiftlyTopCategory {
    if (this.topCategories.length === 0) {
      return null;
    }

    return this.topCategories[0] ?? null;
  }

  public constructor(data: SiftlyStatsApiResponse) {
    this.totalBookmarks = data.totalBookmarks;
    this.bookmarkCount = data.bookmarkCount;
    this.likeCount = data.likeCount;
    this.totalCategories = data.totalCategories;
    this.totalMedia = data.totalMedia;
    this.uncategorizedCount = data.uncategorizedCount;
    this.recentBookmarks = data.recentBookmarks.map((bookmark) => SiftlyBookmark.fromApi(bookmark));
    this.topCategories = data.topCategories;
  }

  public static fromApi(data: SiftlyStatsApiResponse): SiftlyStats {
    return new SiftlyStats(data);
  }

  public hasCategory(slug: string): boolean {
    return this.topCategories.some((category) => category.slug === slug);
  }
}

export type { SiftlyCategory };
