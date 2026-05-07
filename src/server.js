require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const app = require('./app');
const { connectMSSQL } = require('./config/db');
const { startPolling } = require('./services/wifi.service');

const PORT             = process.env.PORT || 8000;
const WIFI_POLL_INTERVAL = parseInt(process.env.WIFI_POLL_INTERVAL) || 300000;

connectMSSQL();
startPolling(WIFI_POLL_INTERVAL);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} : http://localhost:${PORT}`);
});
