import type { ExtractPluginSettingsWrapper } from 'obsidian-dev-utils/obsidian/Plugin/PluginTypesBase';
import type { ReadonlyDeep } from 'type-fest';

import {
  Notice,
  requestUrl
} from 'obsidian';
import { convertAsyncToSync } from 'obsidian-dev-utils/Async';
import { PluginBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginBase';

import type { PluginTypes } from './PluginTypes.ts';

import { PluginSettingsManager } from './PluginSettingsManager.ts';
import { PluginSettingsTab } from './PluginSettingsTab.ts';
import { SiftlySyncer } from './utils/SiftlySyncer.ts';
import {
  normalizeSiftlyBaseUrl,
  SiftlyValidator
} from './utils/SiftlyValidator.ts';

const SYNC_SUCCESS_NOTICE_HIDE_MS = 4000;
const SYNC_ERROR_NOTICE_HIDE_MS = 8000;
const HTTP_STATUS_SUCCESS_MAX = 299;
const HTTP_STATUS_SUCCESS_MIN = 200;

export class Plugin extends PluginBase<PluginTypes> {
  public get siftlySyncer(): SiftlySyncer {
    if (this.siftlySyncerInstance === null) {
      throw new Error('SiftlySyncer is not initialized');
    }
    return this.siftlySyncerInstance;
  }

  private siftlySyncerInstance: null | SiftlySyncer = null;
  private statusBarItemEl: HTMLElement | null = null;
  private syncProgressNotice: Notice | null = null;

  protected override createSettingsManager(): PluginSettingsManager {
    return new PluginSettingsManager(this);
  }

  protected override createSettingsTab(): null | PluginSettingsTab {
    return new PluginSettingsTab(this);
  }

  protected override async onLayoutReady(): Promise<void> {
    await super.onLayoutReady();
  }

  protected override async onloadImpl(): Promise<void> {
    await super.onloadImpl();
    const { settings } = this.settingsManager.settingsWrapper;
    this.siftlySyncerInstance = new SiftlySyncer(this.app, settings);
    this.siftlySyncer.setProgressMonitor('notice', (event) => {
      switch (event.kind) {
        case 'invalid': {
          const message = event.message;
          if (this.syncProgressNotice === null) {
            this.syncProgressNotice = new Notice(message, 0);
          } else {
            this.syncProgressNotice.setMessage(message);
          }
          window.setTimeout(() => {
            this.syncProgressNotice?.hide();
            this.syncProgressNotice = null;
          }, SYNC_ERROR_NOTICE_HIDE_MS);
          break;
        }
        case 'last':
          break;
        case 'never':
          this.syncProgressNotice?.hide();
          break;
        case 'progress':
          break;
        case 'success': {
          const message = `Siftly: synced ${String(event.syncedCount)} bookmarks.`;
          if (this.syncProgressNotice === null) {
            this.syncProgressNotice = new Notice(message, 0);
          } else {
            this.syncProgressNotice.setMessage(message);
          }
          window.setTimeout(() => {
            this.syncProgressNotice?.hide();
            this.syncProgressNotice = null;
          }, SYNC_SUCCESS_NOTICE_HIDE_MS);
          break;
        }
        default:
          break;
      }
    });

    this.addCommand({
      callback: convertAsyncToSync(() => this.runSiftlySyncRibbonIconCommand(true)),
      id: 'sync-siftly-incremental',
      name: 'Sync Siftly (incremental)'
    });
    this.addCommand({
      callback: convertAsyncToSync(() => this.runSiftlySyncRibbonIconCommand(false)),
      id: 'sync-siftly-full',
      name: 'Sync Siftly (full)'
    });

    this.addRibbonIcon('refresh-cw', 'Sync Siftly bookmarks', convertAsyncToSync(() => this.runSiftlySyncRibbonIconCommand()));

    this.statusBarItemEl = this.addStatusBarItem();
    this.statusBarItemEl.empty();
    this.statusBarItemEl.setAttribute('aria-label', 'Siftly - idle');
    this.statusBarItemEl.setAttribute('data-tooltip-position', 'top');
    await this.refreshStatusBarIconBySiftlyStatus();
    this.siftlySyncer.setProgressMonitor('status-bar', (event) => {
      if (!this.statusBarItemEl) {
        return;
      }
      switch (event.kind) {
        case 'invalid':
          this.statusBarItemEl.removeClass('siftly-status-spinning');
          this.statusBarItemEl.setAttribute('aria-label', `Siftly - ${event.message}`);
          break;
        case 'last': {
          this.statusBarItemEl.removeClass('siftly-status-spinning');
          const formatted = event.latestImportedAt.toLocaleString();
          this.statusBarItemEl.setAttribute('aria-label', `Siftly - last synced at ${formatted}`);
          break;
        }
        case 'never':
          this.statusBarItemEl.removeClass('siftly-status-spinning');
          this.statusBarItemEl.setAttribute('aria-label', `Siftly - ${event.message || 'idle'}`);
          break;
        case 'progress':
          this.statusBarItemEl.addClass('siftly-status-spinning');
          this.statusBarItemEl.setAttribute(
            'aria-label',
            `Siftly - syncing: ${String(event.syncedCount)}/${String(event.totalBookmarks)} bookmarks`
          );
          break;
        case 'success': {
          this.statusBarItemEl.removeClass('siftly-status-spinning');
          const formatted = event.latestImportedAt.toLocaleString();
          this.statusBarItemEl.setAttribute(
            'aria-label',
            `Siftly - synced ${String(event.syncedCount)} bookmarks (last at ${formatted})`
          );
          break;
        }
        default:
          this.statusBarItemEl.removeClass('siftly-status-spinning');
          this.statusBarItemEl.setAttribute('aria-label', 'Siftly - idle');
          break;
      }
    });
  }

  protected override async onLoadSettings(
    loadedSettings: ReadonlyDeep<ExtractPluginSettingsWrapper<PluginTypes>>,
    isInitialLoad: boolean
  ): Promise<void> {
    await super.onLoadSettings(loadedSettings, isInitialLoad);
  }

  protected override async onSaveSettings(
    newSettings: ReadonlyDeep<ExtractPluginSettingsWrapper<PluginTypes>>,
    oldSettings: ReadonlyDeep<ExtractPluginSettingsWrapper<PluginTypes>>,
    context: unknown
  ): Promise<void> {
    await super.onSaveSettings(newSettings, oldSettings, context);
    if (newSettings.settings.siftlyUrl !== oldSettings.settings.siftlyUrl) {
      await this.refreshStatusBarIconBySiftlyStatus();
    }
  }

  protected override async onunloadImpl(): Promise<void> {
    this.siftlySyncerInstance?.setProgressMonitor('status-bar', null);
    this.siftlySyncerInstance?.setProgressMonitor('notice', null);
    this.syncProgressNotice?.hide();
    this.syncProgressNotice = null;
    await super.onunloadImpl();
  }

  private async refreshStatusBarIconBySiftlyStatus(): Promise<void> {
    const statusBarItemEl = this.statusBarItemEl;
    if (statusBarItemEl === null) {
      return;
    }

    const validator = new SiftlyValidator();
    const isValid = await validator.validate(this.settingsManager.settingsWrapper.settings.siftlyUrl);
    if (!isValid) {
      statusBarItemEl.empty();
      statusBarItemEl.setText('❌');
      return;
    }

    const logoUrl = `${normalizeSiftlyBaseUrl(this.settingsManager.settingsWrapper.settings.siftlyUrl)}/logo.svg`;
    try {
      const response = await requestUrl({
        throw: false,
        url: logoUrl
      });
      if (response.status < HTTP_STATUS_SUCCESS_MIN || response.status > HTTP_STATUS_SUCCESS_MAX) {
        statusBarItemEl.empty();
        statusBarItemEl.setText('❌');
        return;
      }
    } catch {
      statusBarItemEl.empty();
      statusBarItemEl.setText('❌');
      return;
    }

    statusBarItemEl.empty();
    const logoEl = statusBarItemEl.createEl('img');
    logoEl.src = logoUrl;
    logoEl.alt = 'Siftly';
    logoEl.addClass('siftly-status-logo');
  }

  private async runSiftlySyncRibbonIconCommand(
    syncIncremental: boolean = this.settingsManager.settingsWrapper.settings.syncIncremental
  ): Promise<void> {
    const syncResult = await this.siftlySyncer.sync(syncIncremental);

    if (syncResult.syncedCount > 0 && syncResult.latestImportedAt !== null) {
      const syncedLastTime = syncResult.latestImportedAt;
      await this.settingsManager.editAndSave((settings) => {
        settings.syncedLastTime = syncedLastTime;
      });
    }
  }
}
