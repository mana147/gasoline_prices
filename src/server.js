require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const app = require('./app');
const { connectMSSQL } = require('./config/db');
const { startPolling: startWifiPolling }    = require('./services/wifi.service');
const { startPolling: startWindowsPolling } = require('./services/windows.service');

const PORT                  = process.env.PORT || 8000;
const WIFI_POLL_INTERVAL    = parseInt(process.env.WIFI_POLL_INTERVAL)    || 300000;
const WINDOWS_POLL_INTERVAL = parseInt(process.env.WINDOWS_POLL_INTERVAL) || 300000;

connectMSSQL();
startWifiPolling(WIFI_POLL_INTERVAL);
startWindowsPolling(WINDOWS_POLL_INTERVAL);

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} : http://localhost:${PORT}`);
});
