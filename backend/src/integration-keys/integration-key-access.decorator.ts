import { SetMetadata } from '@nestjs/common';
import type { IntegrationKeyScope } from './integration-key.crypto';

/**
 * How the guard locates the resource a request touches so it can confine
 * integration keys to their root folder subtree.
 */
export type IntegrationKeyTarget =
  | { kind: 'none' }
  /** Only keys without a root folder (organization-wide keys) may call the route. */
  | { kind: 'unrootedOnly' }
  | { kind: 'folderParam'; param: string; excludeRoot?: boolean }
  | { kind: 'fileParam'; param: string }
  | { kind: 'bodyFolder'; fields: string[] }
  | { kind: 'uploadVersionBody'; field: string }
  | { kind: 'uploadSessionParam'; param: string };

export type IntegrationKeyAccessRule = {
  scope: IntegrationKeyScope | null;
  target: IntegrationKeyTarget;
};

export const INTEGRATION_KEY_ACCESS = 'integration-key-access';

/**
 * Opt a route in to integration-key (wdk_) authentication. Routes without this
 * decorator reject integration keys with 403.
 */
export const IntegrationKeyAccess = (scope: IntegrationKeyScope | null, target: IntegrationKeyTarget = { kind: 'none' }) =>
  SetMetadata(INTEGRATION_KEY_ACCESS, { scope, target } satisfies IntegrationKeyAccessRule);
