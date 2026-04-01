import { requestUrl } from 'obsidian';

import type { SiftlyStatsApiResponse } from '../models/SiftlyStats.ts';

const HTTP_STATUS_SUCCESS_MAX = 299;
const HTTP_STATUS_SUCCESS_MIN = 200;

export class SiftlyValidator {
  private readonly statusEl: HTMLElement | null;

  public constructor(statusEl?: HTMLElement | null) {
    this.statusEl = statusEl ?? null;
  }

  public clearStatus(): void {
    this.statusEl?.empty();
    this.statusEl?.removeClass('invalid');
    this.statusEl?.removeClass('valid');
  }

  public async validate(siftlyUrl: string): Promise<boolean> {
    this.clearStatus();

    if (!siftlyUrl.trim()) {
      this.showInvalid('No Siftly URL provided.');
      return false;
    }

    try {
      const statsUrl = buildSiftlyStatsApiUrl(siftlyUrl);
      const response = await requestUrl({
        throw: false,
        url: statsUrl
      });

      if (response.status < HTTP_STATUS_SUCCESS_MIN || response.status > HTTP_STATUS_SUCCESS_MAX) {
        this.showInvalid(`Stats request failed (HTTP ${String(response.status)}).`);
        return false;
      }

      const json: unknown = response.json;

      if (!hasTotalBookmarksField(json)) {
        this.showInvalid('Stats response is missing a numeric total bookmarks field.');
        return false;
      }

      this.showSuccess(json.totalBookmarks);
      return true;
    } catch (error) {
      console.error('Siftly stats validation error:', error);
      this.showInvalid('Failed to reach the Siftly stats API.');
      return false;
    }
  }

  private showInvalid(message: string): void {
    this.statusEl?.removeClass('valid');
    this.statusEl?.addClass('invalid');
    this.statusEl?.setText(message);
  }

  private showSuccess(totalBookmarks: number): void {
    this.statusEl?.removeClass('invalid');
    this.statusEl?.addClass('valid');
    this.statusEl?.setText(`Valid. Total bookmarks: ${String(totalBookmarks)}`);
  }
}

export function buildSiftlyStatsApiUrl(baseUrl: string): string {
  return `${normalizeSiftlyBaseUrl(baseUrl)}/api/stats`;
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
