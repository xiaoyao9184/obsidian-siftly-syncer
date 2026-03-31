import {
  App,
  normalizePath,
  requestUrl,
  TFile
} from 'obsidian';

import type {
  SiftlyBookmarkApiResponse,
  SiftlyBookmarkItemApiResponse,
  SiftlyMediaItem
} from '../Models/SiftlyBookmark.ts';
import type { SiftlyStatsApiResponse } from '../Models/SiftlyStats.ts';
import type { PluginSettings } from '../PluginSettings.ts';

import { SiftlyFilenamer } from './SiftlyFilenamer.ts';
import { SiftlyFilerender } from './SiftlyFilerender.ts';

const HTTP_STATUS_SUCCESS_MAX = 299;
const HTTP_STATUS_SUCCESS_MIN = 200;
const DEFAULT_PAGE_SIZE = 100;
const BINARY_SEARCH_DIVISOR = 2;

export type SiftlySyncProgressEvent =
  | { kind: 'invalid'; message: string }
  | { kind: 'last'; latestImportedAt: Date }
  | { kind: 'never'; message: string }
  | { kind: 'progress'; syncedCount: number; syncedPage: number; totalBookmarks: number; totalPages: number }
  | { kind: 'success'; latestImportedAt: Date; syncedCount: number };

export interface SiftlySyncResult {
  latestImportedAt: Date | null;
  syncedCount: number;
}

export class SiftlySyncer {
  private readonly app: App;
  private readonly progressMonitors = new Map<string, (event: SiftlySyncProgressEvent) => void>();
  private readonly settings: PluginSettings;

  public constructor(app: App, settings: PluginSettings) {
    this.app = app;
    this.settings = settings;
  }

  private static extractFilenameFromContentDisposition(contentDisposition: string | undefined, originalUrl: string, fallbackId: string): string {
    if (contentDisposition) {
      const filenameStarMatch = /filename\*\s*=\s*(?:UTF-8''|)(?<value>[^;]+)/iu.exec(contentDisposition);
      const starValue = filenameStarMatch?.groups?.['value'];
      if (starValue) {
        return decodeURIComponent(starValue.trim().replace(/^"|"$/gu, ''));
      }

      const filenameMatch = /filename\s*=\s*"?[^";]+"?/.exec(contentDisposition);
      const filenameValue = filenameMatch?.[1];
      if (filenameValue) {
        return filenameValue.trim();
      }
    }

    try {
      const url = new URL(originalUrl);
      const pathname = url.pathname;
      const candidate = pathname.split('/').filter((part) => part.length > 0).pop();
      if (candidate) {
        return candidate;
      }
    } catch {
      // Ignore URL parsing errors and fall back to ID-based filename.
    }

    return `media-${fallbackId}`;
  }

  public setProgressMonitor(name: string, callback: ((event: SiftlySyncProgressEvent) => void) | null): void {
    if (callback === null) {
      this.progressMonitors.delete(name);
      return;
    }
    this.progressMonitors.set(name, callback);
  }

  public async sync(syncIncremental: boolean = this.settings.syncIncremental): Promise<SiftlySyncResult> {
    this.progress({ kind: 'never', message: 'Syncing: STARTED' });

    let latestImportedAt: Date = new Date(0);
    let latestImportedAtTimestamp = Number.NEGATIVE_INFINITY;
    let syncedCount = 0;

    try {
      const totalBookmarksFromStats = await this.fetchTotalBookmarks();
      const totalBookmarks = await this.resolveTotalBookmarksForSync(totalBookmarksFromStats, syncIncremental);
      const pageSize = DEFAULT_PAGE_SIZE;
      const totalPages = Math.ceil(totalBookmarks / pageSize);

      await this.ensureFolderExists(this.settings.syncFolder);
      await this.ensureFolderExists(this.settings.syncAttachmentsFolder);

      if (totalPages === 0) {
        this.progress({ kind: 'progress', syncedCount, syncedPage: 0, totalBookmarks, totalPages });
      }
      for (let page = 1; page <= totalPages; page++) {
        this.progress({ kind: 'progress', syncedCount, syncedPage: page, totalBookmarks, totalPages });
        const pageData = await this.fetchBookmarksPage(page, pageSize);
        for (const bookmark of pageData.bookmarks) {
          const importedAtTimestamp = Date.parse(bookmark.importedAt);
          if (Number.isFinite(importedAtTimestamp) && importedAtTimestamp > latestImportedAtTimestamp) {
            latestImportedAtTimestamp = importedAtTimestamp;
            latestImportedAt = new Date(importedAtTimestamp);
          }
          await this.writeBookmarkNote(bookmark);
          syncedCount++;
          this.progress({ kind: 'progress', syncedCount, syncedPage: page, totalBookmarks, totalPages });
        }
      }

      this.progress({ kind: 'success', latestImportedAt, syncedCount });
      return { latestImportedAt, syncedCount };
    } catch (error) {
      console.error('Siftly sync error:', error);
      const message = `Failed to sync bookmarks from Siftly: ${String(error)}`;
      this.progress({ kind: 'invalid', message });
      return {
        latestImportedAt: null,
        syncedCount
      };
    }
  }

  private async downloadMediaForBookmark(bookmark: SiftlyBookmarkItemApiResponse): Promise<SiftlyBookmarkItemApiResponse> {
    if (bookmark.mediaItems.length === 0) {
      return bookmark;
    }

    const normalizedAttachmentsFolder = normalizePath(this.settings.syncAttachmentsFolder.trim());
    await this.ensureFolderExists(normalizedAttachmentsFolder);

    const updatedMediaItems: SiftlyMediaItem[] = [];

    for (const media of bookmark.mediaItems) {
      try {
        const localPath = await this.downloadSingleMedia(media, normalizedAttachmentsFolder);
        updatedMediaItems.push({
          ...media,
          thumbnailUrl: localPath
        });
      } catch (error) {
        console.error('Siftly media download error:', error);
        updatedMediaItems.push(media);
      }
    }

    return {
      ...bookmark,
      mediaItems: updatedMediaItems
    };
  }

  private async downloadSingleMedia(media: SiftlyMediaItem, attachmentsFolder: string): Promise<string> {
    const mediaApiUrl = buildSiftlyMediaApiUrl(this.settings.siftlyUrl, media.url);
    const response = await requestUrl({
      throw: false,
      url: mediaApiUrl
    });

    if (response.status < HTTP_STATUS_SUCCESS_MIN || response.status > HTTP_STATUS_SUCCESS_MAX) {
      throw new Error(`Media request failed (HTTP ${String(response.status)}).`);
    }

    let contentDisposition: string | undefined;
    for (const [key, value] of Object.entries(response.headers)) {
      if (key.toLowerCase() === 'content-disposition') {
        contentDisposition = value;
        break;
      }
    }

    const filename = SiftlySyncer.extractFilenameFromContentDisposition(contentDisposition, media.url, media.id);
    const attachmentPath = normalizePath(`${attachmentsFolder}/${filename}`);

    const data = response.arrayBuffer;

    const existingFile = this.app.vault.getAbstractFileByPath(attachmentPath);
    if (existingFile instanceof TFile) {
      await this.app.vault.modifyBinary(existingFile, data);
    } else {
      await this.app.vault.createBinary(attachmentPath, data);
    }

    return attachmentPath;
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

  private async fetchBookmarkImportedAtTimestampByOrder(order: number): Promise<null | number> {
    if (order < 1) {
      return null;
    }

    const pageData = await this.fetchBookmarksPage(order, 1);
    const bookmark = pageData.bookmarks[0];
    if (bookmark === undefined) {
      return null;
    }

    const importedAtTimestamp = Date.parse(bookmark.importedAt);
    if (!Number.isFinite(importedAtTimestamp)) {
      return null;
    }

    return importedAtTimestamp;
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

  private progress(event: SiftlySyncProgressEvent): void {
    for (const callback of this.progressMonitors.values()) {
      callback(event);
    }
  }

  private async resolveTotalBookmarksForSync(totalBookmarks: number, syncIncremental: boolean): Promise<number> {
    if (!syncIncremental) {
      return totalBookmarks;
    }

    const syncedLastTime = this.settings.syncedLastTime;

    const syncedLastTimestamp = syncedLastTime.getTime();
    let left = 1;
    let right = totalBookmarks;
    let lastNeedSyncOrder = 0;

    while (left <= right) {
      const middle = Math.floor((left + right) / BINARY_SEARCH_DIVISOR);
      const importedAtTimestamp = await this.fetchBookmarkImportedAtTimestampByOrder(middle);
      const needSync = importedAtTimestamp !== null && importedAtTimestamp > syncedLastTimestamp;

      if (needSync) {
        lastNeedSyncOrder = middle;
        left = middle + 1;
      } else {
        right = middle - 1;
      }
    }

    return lastNeedSyncOrder;
  }

  private async writeBookmarkNote(bookmark: SiftlyBookmarkItemApiResponse): Promise<void> {
    const normalizedFolder = normalizePath(this.settings.syncFolder.trim());
    const notePath = SiftlyFilenamer.buildBookmarkNotePath(normalizedFolder, bookmark.tweetCreatedAt, bookmark.text);
    const noteFolder = notePath.split('/').slice(0, -1).join('/');
    if (noteFolder.length > 0) {
      await this.ensureFolderExists(noteFolder);
    }
    const bookmarkWithMedia = await this.downloadMediaForBookmark(bookmark);
    const noteContent = SiftlyFilerender.renderBookmarkNote(bookmarkWithMedia);
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

export function buildSiftlyMediaApiUrl(baseUrl: string, mediaUrl: string): string {
  const url = new URL(`${normalizeSiftlyBaseUrl(baseUrl)}/api/media`);
  url.searchParams.set('url', mediaUrl);
  url.searchParams.set('download', '1');
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
