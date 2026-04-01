# CHANGELOG

## 0.0.1

- chore: add minAppVersion field to manifest.json for compatibility
- fix: clarify ESLint disable comment for import requirements in main.ts
- chore: add ESLint rule to ban specific dependencies in package.json
- chore: add additional ignored paths to markdownlint configuration
- chore: update cspell configuration to include additional ignored paths and words
- style: clean up import formatting and adjust variable assignment in SiftlyStats and SiftlyFilenamer
- refactor: update import paths for consistency in Siftly files
- refactor: remove unused sample components and streamline Plugin and PluginSettings files
- refactor: enhance sync progress UI and streamline related methods in PluginSettingsTab
- refactor: replace checkbox with toggle for incremental sync setting in PluginSettingsTab
- refactor: streamline sync progress handling and update UI methods in Plugin and PluginSettingsTab
- refactor: replace SiftlyStatsValidator with SiftlyValidator
- feat: enhance sync progress monitoring and status bar updates in Plugin and SiftlySyncer
- feat: add incremental and full sync commands to Plugin and update sync logic in PluginSettingsTab
- feat: initialize syncedLastTime to epoch and update sync method to support incremental sync logic in SiftlySyncer
- feat: add syncIncremental property and corresponding UI setting in PluginSettingsTab for incremental synchronization of bookmarks
- feat: add syncedLastTime property and update sync UI to display last sync time in PluginSettingsTab
- feat: create SiftlyFilerender utility for rendering structured bookmark notes in SiftlySyncer
- feat: add SiftlyFilenamer utility for generating structured bookmark note paths in SiftlySyncer
- feat: implement media download functionality in SiftlySyncer and update bookmark rendering with media thumbnails
- feat: integrate SiftlySyncer into Plugin and PluginSettingsTab for enhanced sync UI feedback
- feat: enhance sync progress notifications and error handling in SiftlySyncer
- feat: implement manual sync functionality and enhance sync behavior UI in PluginSettingsTab
- feat: add attachments folder setting to PluginSettingsTab for improved file organization
- feat: enhance Siftly stats validation UI and improve API configuration settings in PluginSettingsTab
- feat: implement Siftly stats validation and UI feedback in PluginSettingsTab
- feat: add settings for Siftly server URL and sync folder in PluginSettingsTab
- refactor: move siftlyUrl and syncFolder properties from Setting model to PluginSettings
- feat: add Setting model with default configuration values
- feat: add SiftlyBookmark and SiftlyStats models with API response interfaces
- style: exclude specstory directory in .gitignore
- init by generator-obsidian-plugin
