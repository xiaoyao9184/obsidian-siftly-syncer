import {
  ButtonComponent,
  Notice
} from 'obsidian';
import { PluginSettingsTabBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsTabBase';
import { SettingEx } from 'obsidian-dev-utils/obsidian/SettingEx';

import type { PluginTypes } from './PluginTypes.ts';
import type { SiftlySyncProgressEvent } from './utils/SiftlySyncer.ts';

import { TypedItem } from './PluginSettings.ts';
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
