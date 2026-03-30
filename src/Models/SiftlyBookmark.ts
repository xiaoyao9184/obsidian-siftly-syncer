export interface SiftlyBookmarkApiResponse {
  bookmarks: SiftlyBookmarkItemApiResponse[];
  limit: number;
  page: number;
  total: number;
}

export interface SiftlyBookmarkItemApiResponse {
  authorHandle: string;
  authorName: string;
  categories: SiftlyCategory[];
  id: string;
  importedAt: string;
  mediaItems: SiftlyMediaItem[];
  source?: string;
  text: string;
  tweetCreatedAt: string;
  tweetId: string;
}

export interface SiftlyCategory {
  color: string;
  confidence: number;
  id: string;
  name: string;
  slug: string;
}

export interface SiftlyMediaItem {
  id: string;
  thumbnailUrl: string;
  type: string;
  url: string;
}

export class SiftlyBookmark {
  public readonly authorHandle: string;
  public readonly authorName: string;
  public readonly categories: SiftlyCategory[];
  public readonly id: string;
  public readonly importedAt: Date;
  public readonly mediaItems: SiftlyMediaItem[];
  public readonly source: string;
  public readonly text: string;
  public readonly tweetCreatedAt: Date;
  public readonly tweetId: string;

  public constructor(data: SiftlyBookmarkItemApiResponse) {
    this.id = data.id;
    this.tweetId = data.tweetId;
    this.text = data.text;
    this.authorHandle = data.authorHandle;
    this.authorName = data.authorName;
    this.source = data.source ?? 'bookmark';
    this.tweetCreatedAt = new Date(data.tweetCreatedAt);
    this.importedAt = new Date(data.importedAt);
    this.mediaItems = data.mediaItems;
    this.categories = data.categories;
  }

  public static fromApi(data: SiftlyBookmarkItemApiResponse): SiftlyBookmark {
    return new SiftlyBookmark(data);
  }

  public static fromApiList(data: SiftlyBookmarkApiResponse): SiftlyBookmark[] {
    return data.bookmarks.map((bookmark) => new SiftlyBookmark(bookmark));
  }
}
