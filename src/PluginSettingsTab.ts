import {
  ButtonComponent,
  Notice
} from 'obsidian';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';
import { SettingEx } from 'obsidian-dev-utils/obsidian/SettingEx';

import type { PluginTypes } from './PluginTypes.ts';
import type { SiftlySyncUiEvent } from './utils/SiftlySyncer.ts';

import { TypedItem } from './PluginSettings.ts';
import { SiftlyStatsValidator } from './utils/SiftlyStatsValidator.ts';

const SYNC_STATS_CLASS_PROGRESS = 'progress';
const SYNC_STATS_CLASS_INVALID = 'invalid';
const SYNC_STATS_CLASS_VALID = 'valid';
const SYNC_STATS_CLASS_LAST = 'last';

export class PluginSettingsTab extends PluginSettingsTabBase<PluginTypes> {
  private siftlyStats: HTMLElement | null = null;
  private syncStats: HTMLElement | null = null;
  private validator: null | SiftlyStatsValidator = null;
  private validatorResult: boolean | undefined = undefined;

  public override display(): void {
    super.display();
    this.plugin.siftlySyncer.setSyncUiCallback(null);
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
        this.siftlyStats = this.createSiftlyStatsElement(this.containerEl);
        this.validator = new SiftlyStatsValidator(this.siftlyStats);

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
      .addCheckbox((checkbox) => {
        this.bind(checkbox, 'syncIncremental');
      });

    new SettingEx(containerEl)
      .setName('Manual sync')
      .setDesc('Sync bookmarks now')
      .addButton((button) => {
        button.setButtonText('Sync now')
          .onClick(async () => {
            if (this.validatorResult) {
              const syncResult = await this.plugin.siftlySyncer.sync(this.plugin.settings.syncIncremental);
              if (syncResult.latestImportedAt !== null) {
                const syncedLastTime = syncResult.latestImportedAt;
                await this.plugin.settingsManager.editAndSave((settings) => {
                  settings.syncedLastTime = syncedLastTime;
                });
                this.applySiftlySyncUiToSyncStats({
                  kind: 'success',
                  latestImportedAt: syncedLastTime,
                  syncedCount: syncResult.syncedCount
                });
              }
            } else {
              new Notice('Please validate the Siftly URL first.');
            }
          });
      })
      .then(async () => {
        this.syncStats = this.createSyncStatsElement(this.containerEl);
        this.plugin.siftlySyncer.setSyncUiCallback((event) => {
          this.applySiftlySyncUiToSyncStats(event);
        });
        const syncedLastTime = this.plugin.settings.syncedLastTime;
        if (syncedLastTime === null) {
          this.applySiftlySyncUiToSyncStats({
            kind: 'clear',
            message: 'Synced: NEVER'
          });
        } else {
          this.applySiftlySyncUiToSyncStats({
            kind: 'last',
            latestImportedAt: syncedLastTime
          });
        }
      });

    new SettingEx(this.containerEl)
      .setName('Button setting name')
      .setDesc('Button setting description.')
      .addButton((button) => {
        button.setButtonText('Button text')
          .onClick(() => {
            new Notice('Button clicked');
          });
      });

    new SettingEx(this.containerEl)
      .setName('Checkbox setting name')
      .setDesc('Checkbox setting description.')
      .addCheckbox((checkbox) => {
        this.bind(checkbox, 'checkboxSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Code highlighter setting name')
      .setDesc('Code highlighter setting description.')
      .addCodeHighlighter((codeHighlighter) => {
        codeHighlighter.setLanguage('javascript');
        this.bind(codeHighlighter, 'codeHighlighterSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Color setting name')
      .setDesc('Color setting description.')
      .addColorPicker((color) => {
        this.bind(color, 'colorSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Date setting name')
      .setDesc('Date setting description.')
      .addDate((date) => {
        this.bind(date, 'dateSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Date time setting name')
      .setDesc('Date time setting description.')
      .addDateTime((dateTime) => {
        this.bind(dateTime, 'dateTimeSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Dropdown setting name')
      .setDesc('Dropdown setting description.')
      .addDropdown((dropdown) => {
        dropdown.addOptions({
          Value1: 'Display 1',
          Value2: 'Display 2',
          Value3: 'Display 3'
        });
        this.bind(dropdown, 'dropdownSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Email setting name')
      .setDesc('Email setting description.')
      .addEmail((email) => {
        this.bind(email, 'emailSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Extra button setting name')
      .setDesc('Extra button setting description.')
      .addExtraButton((extraButton) => {
        extraButton
          .onClick(() => {
            new Notice('Extra button clicked');
          });
      });

    new SettingEx(this.containerEl)
      .setName('File setting name')
      .setDesc('File setting description.')
      .addFile((file) => {
        file.onChange((value) => {
          new Notice(`File selected: ${value?.name ?? '(None)'}`);
        });
      });

    new SettingEx(this.containerEl)
      .setName('Moment format setting name')
      .setDesc('Moment format setting description.')
      .addMomentFormat((momentFormat) => {
        this.bind(momentFormat, 'momentFormatSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Month setting name')
      .setDesc('Month setting description.')
      .addMonth((month) => {
        this.bind(month, 'monthSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Multiple dropdown setting name')
      .setDesc('Multiple dropdown setting description.')
      .addMultipleDropdown((multipleDropdown) => {
        multipleDropdown.addOptions({
          Value1: 'Display 1',
          Value2: 'Display 2',
          Value3: 'Display 3',
          Value4: 'Display 4',
          Value5: 'Display 5'
        });

        this.bind(multipleDropdown, 'multipleDropdownSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Multiple email setting name')
      .setDesc('Multiple email setting description.')
      .addMultipleEmail((multipleEmail) => {
        this.bind(multipleEmail, 'multipleEmailSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Multiple file setting name')
      .setDesc('Multiple file setting description.')
      .addMultipleFile((multipleFile) => {
        multipleFile.onChange((value) => {
          const fileNames = value.map((file) => file.name);
          new Notice(`Files selected: ${fileNames.join(', ')}`);
        });
      });

    new SettingEx(this.containerEl)
      .setName('Multiple text setting name')
      .setDesc('Multiple text setting description.')
      .addMultipleText((multipleText) => {
        this.bind(multipleText, 'multipleTextSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Number setting name')
      .setDesc('Number setting description.')
      .addNumber((number) => {
        this.bind(number, 'numberSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Progress bar setting name')
      .setDesc('Progress bar setting description.')
      .addProgressBar((progressBar) => {
        progressBar.setValue(this.plugin.settings.progressBarSetting);
      });

    new SettingEx(this.containerEl)
      .setName('Search setting name')
      .setDesc('Search setting description.')
      .addSearch((search) => {
        this.bind(search, 'searchSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Slider setting name')
      .setDesc('Slider setting description.')
      .addSlider((slider) => {
        this.bind(slider, 'sliderSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Text setting name')
      .setDesc('Text setting description.')
      .addText((text) => {
        this.bind(text, 'textSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Text area setting name')
      .setDesc('Text area setting description.')
      .addTextArea((textArea) => {
        this.bind(textArea, 'textAreaSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Time setting name')
      .setDesc('Time setting description.')
      .addTime((time) => {
        this.bind(time, 'timeSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Toggle setting name')
      .setDesc('Toggle setting description.')
      .addToggle((toggle) => {
        this.bind(toggle, 'toggleSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Tri-state checkbox setting name')
      .setDesc('Tri-state checkbox setting description.')
      .addTriStateCheckbox((triStateCheckbox) => {
        this.bind(triStateCheckbox, 'triStateCheckboxSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Typed dropdown setting name')
      .setDesc('Typed dropdown setting description.')
      .addTypedDropdown((typedDropdown) => {
        const map = new Map<TypedItem, string>();
        map.set(TypedItem.Foo, 'Display Foo');
        map.set(TypedItem.Bar, 'Display Bar');
        map.set(TypedItem.Baz, 'Display Baz');
        typedDropdown.addOptions(map);
        this.bind(typedDropdown, 'typedDropdownSetting', {
          onChanged(newValue, oldValue) {
            console.warn('Typed Dropdown setting changed', { newValue, oldValue });
          }
        });
      });

    new SettingEx(this.containerEl)
      .setName('Typed multiple dropdown setting name')
      .setDesc('Typed multiple dropdown setting description.')
      .addTypedMultipleDropdown((typedMultipleDropdown) => {
        const map = new Map<TypedItem, string>();
        map.set(TypedItem.Foo, 'Display Foo');
        map.set(TypedItem.Bar, 'Display Bar');
        map.set(TypedItem.Baz, 'Display Baz');
        typedMultipleDropdown.addOptions(map);
        this.bind(typedMultipleDropdown, 'typedMultipleDropdownSetting', {
          onChanged(newValue, oldValue) {
            console.warn('Typed Multiple Dropdown setting changed', { newValue, oldValue });
          }
        });
      });

    new SettingEx(this.containerEl)
      .setName('URL setting name')
      .setDesc('URL setting description.')
      .addUrl((url) => {
        this.bind(url, 'urlSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Week setting name')
      .setDesc('Week setting description.')
      .addWeek((week) => {
        this.bind(week, 'weekSetting');
      });

    new SettingEx(this.containerEl)
      .setName('Advanced text setting name')
      .setDesc('Advanced text setting description.')
      .addText((text) => {
        this.bind(text, 'textSetting', {
          componentToPluginSettingsValueConverter: (uiValue: string) => uiValue.replace(' (converted)', ''),
          onChanged: () => {
            new Notice('Advanced text setting changed');
          },
          pluginSettingsToComponentValueConverter: (pluginSettingsValue: string) => `${pluginSettingsValue} (converted)`
        })
          .setPlaceholder('Enter a value');
      });
  }

  private applySiftlySyncUiToSyncStats(event: SiftlySyncUiEvent): void {
    const el = this.syncStats;
    if (el === null) {
      return;
    }
    switch (event.kind) {
      case 'clear': {
        el.removeClass(SYNC_STATS_CLASS_INVALID);
        el.removeClass(SYNC_STATS_CLASS_LAST);
        el.removeClass(SYNC_STATS_CLASS_PROGRESS);
        el.removeClass(SYNC_STATS_CLASS_VALID);
        el.setText(event.message);
        return;
      }
      case 'invalid': {
        el.removeClass(SYNC_STATS_CLASS_LAST);
        el.removeClass(SYNC_STATS_CLASS_VALID);
        el.removeClass(SYNC_STATS_CLASS_PROGRESS);
        el.addClass(SYNC_STATS_CLASS_INVALID);
        el.setText(
          `Invalid: ${event.message}`
        );
        return;
      }
      case 'last': {
        el.removeClass(SYNC_STATS_CLASS_INVALID);
        el.removeClass(SYNC_STATS_CLASS_PROGRESS);
        el.removeClass(SYNC_STATS_CLASS_VALID);
        el.addClass(SYNC_STATS_CLASS_LAST);
        el.setText(
          `Synced: last @ ${event.latestImportedAt.toLocaleString()}`
        );
        return;
      }
      case 'progress': {
        el.removeClass(SYNC_STATS_CLASS_LAST);
        el.removeClass(SYNC_STATS_CLASS_VALID);
        el.removeClass(SYNC_STATS_CLASS_INVALID);
        el.addClass(SYNC_STATS_CLASS_PROGRESS);
        el.setText(
          `Syncing ${String(event.syncedPage)}/${String(event.totalPages)} pages - ${String(event.syncedCount)}/${String(event.totalBookmarks)} bookmarks.`
        );
        return;
      }
      case 'success': {
        el.removeClass(SYNC_STATS_CLASS_LAST);
        el.removeClass(SYNC_STATS_CLASS_INVALID);
        el.removeClass(SYNC_STATS_CLASS_PROGRESS);
        el.addClass(SYNC_STATS_CLASS_VALID);
        el.setText(
          `Synced ${String(event.syncedCount)} bookmarks @ ${event.latestImportedAt.toLocaleString()}`
        );
        break;
      }
      default: {
        break;
      }
    }
  }

  private createSiftlyStatsElement(containerEl: HTMLElement): HTMLElement {
    const siftlyStats = containerEl.createDiv({ cls: 'siftly-stats-info' });
    siftlyStats.createDiv({ cls: 'siftly-stats-status' });
    siftlyStats.createDiv({ cls: 'siftly-stats-details' });
    return siftlyStats;
  }

  private createSyncStatsElement(containerEl: HTMLElement): HTMLElement {
    const syncStats = containerEl.createDiv({ cls: 'sync-stats-info' });
    syncStats.createDiv({ cls: 'sync-stats-status' });
    syncStats.createDiv({ cls: 'sync-stats-details' });
    return syncStats;
  }
}
