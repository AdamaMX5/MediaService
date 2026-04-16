require('dotenv').config();
const app = require('./app');
const { connectDB } = require('./config/database');
const { initPublicKey } = require('./middleware/auth');

const PORT = process.env.PORT || 3000;

async function start() {
  await connectDB();
  await initPublicKey();
  app.listen(PORT, () => {
    console.log(`MediaService running on port ${PORT}`);
  });
}

start().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
