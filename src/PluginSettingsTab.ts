import {
  ButtonComponent,
  Notice
} from 'obsidian';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';
import { SettingEx } from 'obsidian-dev-utils/obsidian/SettingEx';

import type { PluginTypes } from './PluginTypes.ts';
import type { SiftlySyncProgressEvent } from './utils/SiftlySyncer.ts';

import { SiftlyValidator } from './utils/SiftlyValidator.ts';

const SYNC_PROGRESS_PERCENT_MAX = 100;
const SYNC_PROGRESS_SETTING_HIDDEN_CLASS = 'siftly-sync-progress-setting-hidden';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginTypes> {
  private siftlyStatsElement: HTMLElement | null = null;
  private syncBookmarksProgressBar: { setValue: (value: number) => void } | null = null;
  private syncPagesProgressBar: { setValue: (value: number) => void } | null = null;
  private syncProgressElement: HTMLElement | null = null;
  private validator: null | SiftlyValidator = null;
  private validatorResult: boolean | undefined = undefined;

  public override display(): void {
    super.display();
    this.plugin.siftlySyncer.setProgressMonitor('setting-tab', null);
    const { containerEl } = this;
    containerEl.empty();

    // API configuration settings

    containerEl.createEl('h3', { text: 'API configuration' });
    containerEl.createEl('div', {
      cls: 'setting-item-description',
      text: 'Connection settings for your Siftly instance'
    });

    let currentUrlValue = '';
    new SettingEx(containerEl)
      .setName('Base URL')
      .setDesc('Root URL of your Siftly server, e.g. http://localhost:3000')
      .addUrl((url) => {
        this.bind(url, 'siftlyUrl', {
          onChanged: (newValue, oldValue) => {
            if (newValue !== oldValue) {
              currentUrlValue = newValue;
              this.validator?.clearStatus();
            }
          }
        });
      })
      .addButton((btn: ButtonComponent) => {
        btn
          .setButtonText('Validate')
          .setCta()
          .onClick(async () => {
            if (currentUrlValue) {
              this.validatorResult = await this.validator?.validate(currentUrlValue);
            }
          });
      })
      .then(async () => {
        this.siftlyStatsElement = this.createSiftlyStatsElement(this.containerEl);
        this.validator = new SiftlyValidator(this.siftlyStatsElement);

        // Validate the current URL on load.
        this.validatorResult = await this.validator.validate(this.plugin.settings.siftlyUrl);
      });

    // File organization settings

    containerEl.createEl('h3', { text: 'File organization' });
    containerEl.createEl('div', {
      cls: 'setting-item-description',
      text: 'Configure where your bookmarks and assets are stored'
    });

    new SettingEx(this.containerEl)
      .setName('Sync folder')
      .setDesc('Folder where bookmarks will be saved')
      .addText((text) => {
        this.bind(text, 'syncFolder');
      });

    new SettingEx(this.containerEl)
      .setName('Attachments folder')
      .setDesc('Folder where bookmarks media will be saved')
      .addText((text) => {
        this.bind(text, 'syncAttachmentsFolder');
      });

    // Sync behavior settings

    containerEl.createEl('h3', { text: 'Sync behavior' });
    containerEl.createEl('div', {
      cls: 'setting-item-description',
      text: 'Control how synchronization works'
    });

    new SettingEx(this.containerEl)
      .setName('Incremental sync')
      .setDesc('Only sync new bookmarks since last successful sync')
      .addToggle((toggle) => {
        this.bind(toggle, 'syncIncremental');
      });

    new SettingEx(containerEl)
      .setName('Manual sync')
      .setDesc('Sync bookmarks now')
      .addButton((button) => {
        button.setButtonText('Sync now')
          .onClick(async () => {
            if (this.validatorResult) {
              const syncResult = await this.plugin.siftlySyncer.sync(this.plugin.settings.syncIncremental);
              if (syncResult.syncedCount > 0 && syncResult.latestImportedAt !== null) {
                const syncedLastTime = syncResult.latestImportedAt;
                await this.plugin.settingsManager.editAndSave((settings) => {
                  settings.syncedLastTime = syncedLastTime;
                });
              }
            } else {
              new Notice('Please validate the Siftly URL first.');
            }
          });
      });

    new SettingEx(this.containerEl)
      .setName('Sync progress')
      .setDesc('Progress while bookmarks are being synchronized')
      .addProgressBar((progressBar) => {
        this.syncPagesProgressBar = progressBar;
        progressBar.setValue(0);
      })
      .addProgressBar((progressBar) => {
        this.syncBookmarksProgressBar = progressBar;
        progressBar.setValue(0);
      }).then((settingEx) => {
        this.syncProgressElement = settingEx.settingEl;
        this.syncProgressElement.addClass(SYNC_PROGRESS_SETTING_HIDDEN_CLASS);

        this.plugin.siftlySyncer.setProgressMonitor('setting-tab', (event) => {
          this.updateSyncProgressBarValues(event);
        });
      });

    new SettingEx(this.containerEl)
      .setName('Last sync time')
      .setDesc('Time of the last successful sync (updates when bookmarks are synchronized)')
      .addDateTime((date) => {
        this.bind(date, 'syncedLastTime');
      });
  }

  private createSiftlyStatsElement(containerEl: HTMLElement): HTMLElement {
    const siftlyStats = containerEl.createDiv({ cls: 'siftly-stats-info' });
    siftlyStats.createDiv({ cls: 'siftly-stats-status' });
    siftlyStats.createDiv({ cls: 'siftly-stats-details' });
    return siftlyStats;
  }

  private setSyncProgressSettingVisible(visible: boolean): void {
    const el = this.syncProgressElement;
    if (el === null) {
      return;
    }
    if (visible) {
      el.removeClass(SYNC_PROGRESS_SETTING_HIDDEN_CLASS);
    } else {
      el.addClass(SYNC_PROGRESS_SETTING_HIDDEN_CLASS);
    }
  }

  private updateSyncProgressBarValues(event: SiftlySyncProgressEvent): void {
    const barPages = this.syncPagesProgressBar;
    const barBookmarks = this.syncBookmarksProgressBar;
    if (barPages === null || barBookmarks === null) {
      return;
    }
    switch (event.kind) {
      case 'progress': {
        this.setSyncProgressSettingVisible(true);
        barPages.setValue((event.syncedPage / event.totalPages) * SYNC_PROGRESS_PERCENT_MAX);
        barBookmarks.setValue((event.syncedCount / event.totalBookmarks) * SYNC_PROGRESS_PERCENT_MAX);
        break;
      }
      default: {
        barPages.setValue(0);
        barBookmarks.setValue(0);
        this.setSyncProgressSettingVisible(false);
        break;
      }
    }
  }
}
