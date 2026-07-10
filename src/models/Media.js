const mongoose = require('mongoose');

const mediaSchema = new mongoose.Schema({
  app_name:         { type: String, required: true, index: true },
  folder:           { type: String, default: '' },       // e.g. "projects/design"
  stored_name:      { type: String, required: true },    // UUID-based filename on disk
  original_name:    { type: String, required: true },    // original upload filename
  name:             { type: String, default: '' },       // user-provided display name
  description:      { type: String, default: '' },
  mimetype:         { type: String, required: true },
  size:             { type: Number, required: true },    // bytes
  hash:             { type: String, required: true },    // sha256 of file content, for dedup within app_name
  uploaded_by:      { type: String, required: true },    // user id from JWT
  uploaded_by_email:{ type: String, default: '' },
  url:              { type: String, required: true },    // public GET URL
}, {
  timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
});

// Compound index for path-based lookups
mediaSchema.index({ app_name: 1, folder: 1 });

// Dedup index: one hash per app_name (the storage prefix) — enforces uniqueness
// even under concurrent uploads of the same file, not just at the application level.
mediaSchema.index({ app_name: 1, hash: 1 }, { unique: true });

module.exports = mongoose.model('Media', mediaSchema);
