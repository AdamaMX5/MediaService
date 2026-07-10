const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// upload.js reads UPLOAD_DIR at require-time (fs.mkdirSync(TEMP_DIR, ...)),
// so this must be set before requiring the app.
const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'mediaservice-test-'));
process.env.UPLOAD_DIR = UPLOAD_DIR;
process.env.BASE_URL = 'http://localhost:3000';

// --- Mock the auth middleware so requests don't need a real JWT. ---------
// The mocked user is mutable via __setUser so PII-trimming tests can swap
// "requester === original uploader" vs "requester !== original uploader".
jest.mock('../src/middleware/auth', () => {
  let currentUser = { id: 'user-1', sub: 'user-1', email: 'user1@example.com', roles: [] };
  return {
    authenticate: (req, res, next) => {
      req.user = currentUser;
      next();
    },
    initPublicKey: jest.fn(),
    __setUser: (u) => {
      currentUser = u;
    },
  };
});

// --- Mock the Mongoose Media model. ---------------------------------------
// mongodb-memory-server cannot download its MongoDB binary in this sandbox
// (network to fastdl.mongodb.org is blocked — confirmed manually), so we
// mock the model directly instead of running against a real/in-memory DB.
// Media.findOne / Media.prototype.save are jest.fn()s the tests configure
// per-case; instances keep their own enumerable fields so res.json(media)
// serializes the same shape a real Mongoose doc would for a fresh insert.
jest.mock('../src/models/Media', () => {
  function MediaMock(doc) {
    Object.assign(this, doc);
  }
  MediaMock.prototype.toObject = function toObject() {
    return { ...this };
  };
  MediaMock.prototype.save = jest.fn().mockResolvedValue(undefined);
  MediaMock.findOne = jest.fn().mockResolvedValue(null);
  return MediaMock;
});

const request = require('supertest');
const app = require('../src/app');
const Media = require('../src/models/Media');
const authMock = require('../src/middleware/auth');

function sha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function fakeExistingDoc(overrides = {}) {
  const base = {
    _id: 'existing-id-123',
    app_name: 'VirtualOffice',
    folder: '',
    stored_name: 'existing-stored-name.png',
    original_name: 'original.png',
    name: 'original.png',
    description: '',
    mimetype: 'image/png',
    size: 5,
    hash: sha256(Buffer.from('duplicate-content')),
    uploaded_by: 'original-uploader',
    uploaded_by_email: 'original@example.com',
    url: 'http://localhost:3000/files/VirtualOffice/existing-stored-name.png',
    created_at: new Date('2024-01-01T00:00:00Z'),
    updated_at: new Date('2024-01-01T00:00:00Z'),
  };
  const doc = { ...base, ...overrides };
  doc.toObject = () => doc;
  return doc;
}

function listFiles(dir) {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

beforeEach(() => {
  Media.findOne.mockReset().mockResolvedValue(null);
  Media.prototype.save.mockReset().mockResolvedValue(undefined);
  authMock.__setUser({ id: 'user-1', sub: 'user-1', email: 'user1@example.com', roles: [] });
});

afterAll(() => {
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describe('POST /upload — non-duplicate uploads', () => {
  it('stores a new file, creates a Media doc with a hash field, and returns 201', async () => {
    const content = Buffer.from('hello world, unique content');
    const expectedHash = sha256(content);

    const res = await request(app)
      .post('/upload')
      .field('app_name', 'VirtualOffice')
      .attach('file', content, 'test.txt');

    expect(res.status).toBe(201);
    expect(res.body.hash).toBe(expectedHash);
    expect(res.body.app_name).toBe('VirtualOffice');
    expect(res.body.duplicate).toBeUndefined();
    expect(res.body.stored_name).toMatch(/\.txt$/);

    // File actually landed on disk under UPLOAD_DIR/VirtualOffice/<uuid>.txt
    const diskPath = path.join(UPLOAD_DIR, 'VirtualOffice', res.body.stored_name);
    expect(fs.existsSync(diskPath)).toBe(true);
    expect(fs.readFileSync(diskPath)).toEqual(content);

    expect(Media.prototype.save).toHaveBeenCalledTimes(1);
  });

  it('rejects when app_name is missing (400) and removes the temp file', async () => {
    const res = await request(app)
      .post('/upload')
      .attach('file', Buffer.from('no app name'), 'a.txt');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/app_name/i);
    expect(listFiles(path.join(UPLOAD_DIR, 'temp'))).toHaveLength(0);
  });

  it('rejects when no file is provided (400)', async () => {
    const res = await request(app).post('/upload').field('app_name', 'VirtualOffice');

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/no file/i);
  });
});

describe('POST /upload — duplicate detection (scoped per app_name)', () => {
  it('returns 200 with the existing file URL, marks duplicate:true, and does not create a second Media doc or file', async () => {
    const content = Buffer.from('duplicate-content');
    const existing = fakeExistingDoc({ app_name: 'VirtualOffice', hash: sha256(content) });
    Media.findOne.mockResolvedValueOnce(existing);

    const res = await request(app)
      .post('/upload')
      .field('app_name', 'VirtualOffice')
      .attach('file', content, 'dupe.png');

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(res.body.url).toBe(existing.url);
    expect(res.body._id).toBe(existing._id);
    // The duplicate response now carries the hash too, matching the shape
    // of a fresh (201) upload response.
    expect(res.body.hash).toBe(existing.hash);

    // No new Media doc was created for the duplicate.
    expect(Media.prototype.save).not.toHaveBeenCalled();

    // The re-uploaded temp file was deleted, not left behind, and nothing
    // was written into the app_name target directory for this request.
    expect(listFiles(path.join(UPLOAD_DIR, 'temp'))).toHaveLength(0);
  });

  it('does NOT include uploaded_by / uploaded_by_email when the requester differs from the original uploader (PII trim)', async () => {
    const content = Buffer.from('duplicate-content-2');
    const existing = fakeExistingDoc({
      app_name: 'VirtualOffice',
      hash: sha256(content),
      uploaded_by: 'someone-else',
      uploaded_by_email: 'someone-else@example.com',
    });
    Media.findOne.mockResolvedValueOnce(existing);
    authMock.__setUser({ id: 'user-1', sub: 'user-1', email: 'user1@example.com', roles: [] });

    const res = await request(app)
      .post('/upload')
      .field('app_name', 'VirtualOffice')
      .attach('file', content, 'dupe.png');

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(res.body).not.toHaveProperty('uploaded_by');
    expect(res.body).not.toHaveProperty('uploaded_by_email');
  });

  it('DOES include uploaded_by / uploaded_by_email when the requester IS the original uploader', async () => {
    const content = Buffer.from('duplicate-content-3');
    const existing = fakeExistingDoc({
      app_name: 'VirtualOffice',
      hash: sha256(content),
      uploaded_by: 'user-1',
      uploaded_by_email: 'user1@example.com',
    });
    Media.findOne.mockResolvedValueOnce(existing);
    authMock.__setUser({ id: 'user-1', sub: 'user-1', email: 'user1@example.com', roles: [] });

    const res = await request(app)
      .post('/upload')
      .field('app_name', 'VirtualOffice')
      .attach('file', content, 'dupe.png');

    expect(res.status).toBe(200);
    expect(res.body.uploaded_by).toBe('user-1');
    expect(res.body.uploaded_by_email).toBe('user1@example.com');
  });

  it('does not treat the same content as duplicate under a different app_name (dedup scoped per app_name)', async () => {
    const content = Buffer.from('shared-content-across-apps');
    const expectedHash = sha256(content);
    // Both requests simulate "no existing match" — a real per-app_name index
    // would behave the same way, since the compound key differs by app_name.
    Media.findOne.mockResolvedValue(null);

    const res1 = await request(app)
      .post('/upload')
      .field('app_name', 'AppA')
      .attach('file', content, 'shared.bin');
    const res2 = await request(app)
      .post('/upload')
      .field('app_name', 'AppB')
      .attach('file', content, 'shared.bin');

    expect(res1.status).toBe(201);
    expect(res2.status).toBe(201);
    expect(res1.body.duplicate).toBeUndefined();
    expect(res2.body.duplicate).toBeUndefined();

    // Confirms the route queries scoped by app_name (not hash alone) —
    // same hash, different app_name in each call.
    expect(Media.findOne).toHaveBeenNthCalledWith(1, { app_name: 'AppA', hash: expectedHash });
    expect(Media.findOne).toHaveBeenNthCalledWith(2, { app_name: 'AppB', hash: expectedHash });

    expect(Media.prototype.save).toHaveBeenCalledTimes(2);
  });

  it('computes a consistent hash for identical content and a different hash for different content', async () => {
    const contentA = Buffer.from('identical-content');
    const contentB = Buffer.from('totally-different-content');

    await request(app).post('/upload').field('app_name', 'HashCheck').attach('file', contentA, 'a.bin');
    await request(app).post('/upload').field('app_name', 'HashCheck').attach('file', contentA, 'a-again.bin');
    await request(app).post('/upload').field('app_name', 'HashCheck').attach('file', contentB, 'b.bin');

    const calls = Media.findOne.mock.calls.map(([q]) => q.hash);
    expect(calls[0]).toBe(calls[1]); // same content -> same hash
    expect(calls[0]).not.toBe(calls[2]); // different content -> different hash
    expect(calls[0]).toBe(sha256(contentA));
    expect(calls[2]).toBe(sha256(contentB));
  });
});

describe('POST /upload — race-condition fallback (concurrent duplicate upload)', () => {
  it('when save() hits a Mongo duplicate-key error (11000), deletes the losing file and returns the winner with 200 + duplicate:true', async () => {
    const content = Buffer.from('race-condition-content');
    const winner = fakeExistingDoc({
      app_name: 'RaceConditionApp',
      hash: sha256(content),
      uploaded_by: 'other-winner',
      uploaded_by_email: 'winner@example.com',
    });

    // First findOne (pre-write dedup check) finds nothing -> proceeds to write + save.
    Media.findOne.mockResolvedValueOnce(null);
    // save() loses the race.
    const dupErr = new Error('E11000 duplicate key error');
    dupErr.code = 11000;
    Media.prototype.save.mockRejectedValueOnce(dupErr);
    // Second findOne (inside the 11000 catch) returns the actual winner.
    Media.findOne.mockResolvedValueOnce(winner);

    const res = await request(app)
      .post('/upload')
      .field('app_name', 'RaceConditionApp')
      .attach('file', content, 'race.bin');

    expect(res.status).toBe(200);
    expect(res.body.duplicate).toBe(true);
    expect(res.body.url).toBe(winner.url);
    expect(res.body.hash).toBe(winner.hash);
    // Requester (user-1) != original uploader (other-winner) -> PII trimmed here too.
    expect(res.body).not.toHaveProperty('uploaded_by');

    // The file this request wrote to disk before losing the race must not remain
    // (this app_name is unique to this test, so the dir must end up empty).
    expect(listFiles(path.join(UPLOAD_DIR, 'RaceConditionApp'))).toHaveLength(0);
  });

  it('re-throws the original error (500) instead of crashing if the winner cannot be found after an 11000 error', async () => {
    const content = Buffer.from('race-condition-content-2');

    Media.findOne.mockResolvedValueOnce(null);
    const dupErr = new Error('E11000 duplicate key error');
    dupErr.code = 11000;
    Media.prototype.save.mockRejectedValueOnce(dupErr);
    // Winner lookup unexpectedly comes back empty.
    Media.findOne.mockResolvedValueOnce(null);

    const res = await request(app)
      .post('/upload')
      .field('app_name', 'RaceConditionApp2')
      .attach('file', content, 'race2.bin');

    expect(res.status).toBe(500);
    expect(res.body.error).toMatch(/duplicate key/i);
  });
});
