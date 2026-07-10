/**
 * Schema-level tests for the Media model — no DB connection required.
 * Mongoose exposes the declared indexes/paths without connecting, so these
 * assertions run against the real model definition (not a mock).
 */
const Media = require('../src/models/Media');

describe('Media model schema (dedup-related)', () => {
  it('declares a unique compound index on {app_name, hash} so dedup is enforced per app_name at the DB layer', () => {
    const indexes = Media.schema.indexes();
    const dedupIndex = indexes.find(
      ([fields]) => fields.app_name === 1 && fields.hash === 1
    );

    expect(dedupIndex).toBeDefined();
    const [, options] = dedupIndex;
    expect(options.unique).toBe(true);
  });

  it('does NOT declare a global unique index on hash alone (dedup must stay scoped per app_name)', () => {
    const indexes = Media.schema.indexes();
    const globalHashIndex = indexes.find(
      ([fields]) => Object.keys(fields).length === 1 && fields.hash === 1 && fields.hash !== undefined
    );
    expect(globalHashIndex).toBeUndefined();
  });

  it('requires the hash field', () => {
    const hashPath = Media.schema.path('hash');
    expect(hashPath).toBeDefined();
    expect(hashPath.isRequired).toBe(true);
    expect(hashPath.instance).toBe('String');
  });
});
