export class PluginSettings {
  public siftlyUrl = 'http://localhost:3000';
  public syncAttachmentsFolder = '@Siftly/attachments';
  public syncedLastTime = new Date(0);
  public syncFolder = '@Siftly';
  public syncIncremental = true;
}
