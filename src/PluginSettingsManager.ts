import { PluginSettingsManagerBase } from 'obsidian-dev-utils/obsidian/Plugin/PluginSettingsManagerBase';

import type { PluginTypes } from './PluginTypes.ts';

import { PluginSettings } from './PluginSettings.ts';

const RECORD_VERSION_KEY = 'version';

interface Migration {
  fromVersion: string;
  migrate: (record: SettingsRecord) => Promise<void> | void;
  toVersion: string;
}

type SettingsRecord = Record<string, unknown>;

const MIGRATIONS: readonly Migration[] = [
  {
    fromVersion: '0.0.0',
    migrate(record): void {
      record['version'] = '0.0.1';
    },
    toVersion: '0.0.1'
  }
];

export class PluginSettingsManager extends PluginSettingsManagerBase<PluginTypes> {
  protected override createDefaultSettings(): PluginSettings {
    return new PluginSettings();
  }

  protected override async onLoadRecord(record: SettingsRecord): Promise<void> {
    await super.onLoadRecord(record);
    await this.runMigrations(record);
  }

  protected override async onSavingRecord(record: SettingsRecord): Promise<void> {
    this.setRecordVersion(record, this.getCurrentRecordVersion());
    await super.onSavingRecord(record);
  }

  protected override registerValidators(): void {
    super.registerValidators();
  }

  private getCurrentRecordVersion(): string {
    return this.plugin.manifest.version;
  }

  private getMigrationsToApply(startVersion: string): null | readonly Migration[] {
    const migrations: Migration[] = [];
    const visitedVersions = new Set<string>();
    const targetVersion = this.getCurrentRecordVersion();
    let version = startVersion;

    while (version !== targetVersion) {
      const currentVersion = version;
      if (visitedVersions.has(version)) {
        return null;
      }

      visitedVersions.add(currentVersion);
      const migration = MIGRATIONS.find((item) => item.fromVersion === currentVersion);

      if (migration === undefined) {
        return null;
      }

      migrations.push(migration);
      version = migration.toVersion;
    }

    return migrations;
  }

  private getRecordVersion(record: SettingsRecord): string {
    const version = record[RECORD_VERSION_KEY];
    return typeof version === 'string' ? version : '0.0.0';
  }

  private async runMigrations(record: SettingsRecord): Promise<void> {
    const version = this.getRecordVersion(record);
    const migrations = this.getMigrationsToApply(version);
    if (migrations === null) {
      console.warn(`Unknown settings record version "${version}". Skipping migrations.`);
      return;
    }
    for (const migration of migrations) {
      await migration.migrate(record);
    }

    this.setRecordVersion(record, this.getCurrentRecordVersion());
  }

  private setRecordVersion(record: SettingsRecord, version: string): void {
    record[RECORD_VERSION_KEY] = version;
  }
}
