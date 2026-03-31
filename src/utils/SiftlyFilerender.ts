import type { SiftlyBookmarkItemApiResponse } from '../Models/SiftlyBookmark.ts';

export const SiftlyFilerender = {
  renderBookmarkNote(bookmark: SiftlyBookmarkItemApiResponse): string {
    const sourceUrl = `https://x.com/${bookmark.authorHandle}/status/${bookmark.tweetId}`;
    const tags = bookmark.categories.map((category) => category.slug);
    const categoryNames = bookmark.categories.map((category) => category.name);
    const mediaLinks = bookmark.mediaItems
      .map((media) => `[![](${media.thumbnailUrl})](${media.url})`)
      .join('\n');

    return `---
siftlyId: "${bookmark.id}"
tweetId: "${bookmark.tweetId}"
author: "${bookmark.authorName}"
authorHandle: "${bookmark.authorHandle}"
tweetCreatedAt: "${bookmark.tweetCreatedAt}"
importedAt: "${bookmark.importedAt}"
sourceUrl: "${sourceUrl}"
categories: [${categoryNames.map((name) => `"${name}"`).join(', ')}]
tags: [${tags.map((tag) => `"${tag}"`).join(', ')}]
---

${mediaLinks || ''}

${bookmark.text}

`;
  }
};
