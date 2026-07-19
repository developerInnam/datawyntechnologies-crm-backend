require('dotenv').config();
const db = require('./config/db');

async function run() {
  try {
    const [result] = await db.query(`
      UPDATE activities 
      SET status = 'canceled' 
      WHERE status = 'pending' 
      AND follow_up_date IS NOT NULL 
      AND (
        (meeting_time IS NOT NULL AND CONCAT(follow_up_date, ' ', meeting_time) < NOW())
        OR
        (meeting_time IS NULL AND DATE(follow_up_date) < CURDATE())
      )
    `);
    // mysql2 returns result as an OkPacket when using pool.query
    console.log('Auto-cancel job completed.');
    console.log(result);
    process.exit(0);
  } catch (error) {
    console.error('Error running auto-cancel job:', error);
    process.exit(2);
  }
}

run();
