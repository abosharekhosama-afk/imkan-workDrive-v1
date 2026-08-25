import { apiRequest } from './client';
import type { ResourceType } from './types';

export type FavoriteRecord = { id: string; resourceType: ResourceType; resourceId: string; createdAt: string; name: string };
export function listFavorites() { return apiRequest<FavoriteRecord[]>('/favorites'); }
export function addFavorite(resourceType: ResourceType, resourceId: string) { return apiRequest(`/favorites/${resourceType}/${resourceId}`, { method: 'POST' }); }
export function removeFavorite(resourceType: ResourceType, resourceId: string) { return apiRequest(`/favorites/${resourceType}/${resourceId}`, { method: 'DELETE' }); }
