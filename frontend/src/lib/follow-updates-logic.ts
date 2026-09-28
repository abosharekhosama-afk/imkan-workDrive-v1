import type { MessageKey } from '../i18n';

/** Zoho-style menu label for follow / unfollow updates. */
export function followUpdatesMenuLabel(isFollowing: boolean): MessageKey {
  return isFollowing ? 'menu.unfollowUpdates' : 'menu.followUpdates';
}

/** Toast after toggling follow updates on a resource. */
export function followUpdatesToastMessage(isFollowing: boolean, resourceName: string): MessageKey {
  return isFollowing ? 'follow.started' : 'follow.stopped';
}

export function followUpdatesToastParams(resourceName: string) {
  return { name: resourceName };
}
