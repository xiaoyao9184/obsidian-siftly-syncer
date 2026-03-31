import {
  App,
  normalizePath,
  Notice,
  requestUrl,
  TFile
} from 'obsidian';

import type {
  SiftlyBookmarkApiResponse,
  SiftlyBookmarkItemApiResponse
} from '../Models/SiftlyBookmark.ts';
import type { SiftlyStatsApiResponse } from '../Models/SiftlyStats.ts';
import type { PluginSettings } from '../PluginSettings.ts';

const HTTP_STATUS_SUCCESS_MAX = 299;
const HTTP_STATUS_SUCCESS_MIN = 200;
const DEFAULT_PAGE_SIZE = 100;
const SYNC_SUCCESS_NOTICE_HIDE_MS = 4000;
const SYNC_ERROR_NOTICE_HIDE_MS = 8000;

export type SiftlySyncUiEvent =
  | { kind: 'clear' }
  | { kind: 'invalid'; message: string }
  | { kind: 'progress'; syncedCount: number; syncedPage: number; totalBookmarks: number; totalPages: number }
  | { kind: 'success'; syncedCount: number; totalBookmarks: number };

export class SiftlySyncer {
  private readonly app: App;
  private readonly settings: PluginSettings;
  private syncUiCallback: ((event: SiftlySyncUiEvent) => void) | null = null;

  public constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  public setSyncUiCallback(callback: ((event: SiftlySyncUiEvent) => void) | null): void {
    this.syncUiCallback = callback;
  }

  public async sync(): Promise<boolean> {
    this.notifySyncUi({ kind: 'clear' });

    let progressNotice: Notice | undefined;

    try {
      const totalBookmarks = await this.fetchTotalBookmarks();
      const pageSize = DEFAULT_PAGE_SIZE;
      const totalPages = Math.ceil(totalBookmarks / pageSize);

      await this.ensureFolderExists(this.settings.syncFolder);

      progressNotice = new Notice(
        formatSiftlySyncProgressLine(0, totalBookmarks),
        0
      );

      let syncedCount = 0;
      if (totalPages === 0) {
        this.notifySyncUi({ kind: 'progress', syncedCount, syncedPage: 0, totalBookmarks, totalPages });
      }
      for (let page = 1; page <= totalPages; page++) {
        this.notifySyncUi({ kind: 'progress', syncedCount, syncedPage: page, totalBookmarks, totalPages });
        const pageData = await this.fetchBookmarksPage(page, pageSize);
        for (const bookmark of pageData.bookmarks) {
          await this.writeBookmarkNote(bookmark);
          syncedCount++;
          this.notifySyncUi({ kind: 'progress', syncedCount, syncedPage: page, totalBookmarks, totalPages });
          progressNotice.setMessage(
            formatSiftlySyncProgressLine(syncedCount, totalBookmarks)
          );
        }
      }

      progressNotice.setMessage(
        `Siftly: synced ${String(syncedCount)}/${String(totalBookmarks)} bookmarks.`
      );
      window.setTimeout(() => {
        progressNotice?.hide();
      }, SYNC_SUCCESS_NOTICE_HIDE_MS);

      this.notifySyncUi({ kind: 'success', syncedCount, totalBookmarks });
      return true;
    } catch (error) {
      console.error('Siftly sync error:', error);
      const message = `Failed to sync bookmarks from Siftly: ${String(error)}`;
      if (progressNotice !== undefined) {
        progressNotice.setMessage(message);
        window.setTimeout(() => {
          progressNotice?.hide();
        }, SYNC_ERROR_NOTICE_HIDE_MS);
      }
      this.notifySyncUi({ kind: 'invalid', message });
      return false;
    }
  }

  private async ensureFolderExists(folderPath: string): Promise<void> {
    let normalizedFolder = normalizePath(folderPath.trim());
    if (!normalizedFolder || normalizedFolder === '.') {
      return;
    }

    // Vault paths are relative to root; a leading "/" would yield empty split segments.
    while (normalizedFolder.startsWith('/')) {
      normalizedFolder = normalizedFolder.slice(1);
    }

    const parts = normalizedFolder.split('/').filter((part) => part.length > 0);
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      if (await this.app.vault.adapter.exists(currentPath)) {
        continue;
      }

      try {
        await this.app.vault.createFolder(currentPath);
      } catch {
        if (!(await this.app.vault.adapter.exists(currentPath))) {
          throw new Error(`Failed to create folder: ${currentPath}`);
        }
      }
    }
  }

  private async fetchBookmarksPage(page: number, limit: number): Promise<SiftlyBookmarkApiResponse> {
    const bookmarksUrl = buildSiftlyBookmarksApiUrl(this.settings.siftlyUrl, page, limit);
    const response = await requestUrl({
      throw: false,
      url: bookmarksUrl
    });

    if (response.status < HTTP_STATUS_SUCCESS_MIN || response.status > HTTP_STATUS_SUCCESS_MAX) {
      throw new Error(`Bookmarks request failed (HTTP ${String(response.status)}).`);
    }

    const json: unknown = response.json;
    if (!isBookmarkApiResponse(json)) {
      throw new Error('Bookmarks response is invalid.');
    }

    return json;
  }

  private async fetchTotalBookmarks(): Promise<number> {
    const statsUrl = buildSiftlyStatsApiUrl(this.settings.siftlyUrl);
    const response = await requestUrl({
      throw: false,
      url: statsUrl
    });

    if (response.status < HTTP_STATUS_SUCCESS_MIN || response.status > HTTP_STATUS_SUCCESS_MAX) {
      throw new Error(`Stats request failed (HTTP ${String(response.status)}).`);
    }

    const json: unknown = response.json;
    if (!hasTotalBookmarksField(json)) {
      throw new Error('Stats response is missing a numeric total bookmarks field.');
    }

    return json.totalBookmarks;
  }

  private notifySyncUi(event: SiftlySyncUiEvent): void {
    this.syncUiCallback?.(event);
  }

  private async writeBookmarkNote(bookmark: SiftlyBookmarkItemApiResponse): Promise<void> {
    const normalizedFolder = normalizePath(this.settings.syncFolder.trim());
    const notePath = normalizePath(`${normalizedFolder}/${bookmark.tweetId}.md`);
    const noteContent = renderBookmarkNote(bookmark);
    const existingFile = this.app.vault.getAbstractFileByPath(notePath);

    if (existingFile instanceof TFile) {
      await this.app.vault.modify(existingFile, noteContent);
      return;
    }

    await this.app.vault.create(notePath, noteContent);
  }
}

export function buildSiftlyBookmarksApiUrl(baseUrl: string, page: number, limit: number): string {
  const url = new URL(`${normalizeSiftlyBaseUrl(baseUrl)}/api/bookmarks`);
  url.searchParams.set('page', String(page));
  url.searchParams.set('limit', String(limit));
  return url.toString();
}

export function buildSiftlyStatsApiUrl(baseUrl: string): string {
  return `${normalizeSiftlyBaseUrl(baseUrl)}/api/stats`;
}

export function formatSiftlySyncProgressLine(done: number, totalBookmarks: number): string {
  return `Siftly: syncing: ${String(done)}/${String(totalBookmarks)} bookmarks`;
}

export function normalizeSiftlyBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function hasTotalBookmarksField(data: unknown): data is Pick<SiftlyStatsApiResponse, 'totalBookmarks'> {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const record = data as Record<string, unknown>;
  const total = record['totalBookmarks'];
  return typeof total === 'number' && Number.isFinite(total);
}

function isBookmarkApiResponse(data: unknown): data is SiftlyBookmarkApiResponse {
  if (typeof data !== 'object' || data === null) {
    return false;
  }

  const record = data as Record<string, unknown>;
  return Array.isArray(record['bookmarks']);
}

function renderBookmarkNote(bookmark: SiftlyBookmarkItemApiResponse): string {
  const tags = bookmark.categories.map((category) => category.slug);
  const categoryNames = bookmark.categories.map((category) => category.name).join(', ');
  const sourceUrl = `https://x.com/${bookmark.authorHandle}/status/${bookmark.tweetId}`;
  const mediaLinks = bookmark.mediaItems.map((media) => `- ${media.url}`).join('\n');

  return `---
siftlyId: "${bookmark.id}"
tweetId: "${bookmark.tweetId}"
author: "${bookmark.authorName}"
authorHandle: "${bookmark.authorHandle}"
tweetCreatedAt: "${bookmark.tweetCreatedAt}"
importedAt: "${bookmark.importedAt}"
sourceUrl: "${sourceUrl}"
categories: [${tags.map((tag) => `"${tag}"`).join(', ')}]
---

# ${bookmark.authorName}

${bookmark.text}

## Categories

${categoryNames || '(none)'}

## Media

${mediaLinks || '(none)'}
`;
}
