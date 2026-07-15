import type { GeneratedBundledCatalogModule } from './validation';

/**
 * Kept behind a function so unit tests can inject a byte-exact fixture. Metro still sees the static
 * require and includes the generated module produced by the catalog-data track.
 */
export function loadGeneratedBundledCatalog(): GeneratedBundledCatalogModule {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('../../../../assets/catalog/exercise-catalog-v1.generated') as GeneratedBundledCatalogModule;
}
