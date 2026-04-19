require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const app = require('./app');
const { connectMSSQL } = require('./config/db');

const PORT = process.env.PORT || 8000; 

connectMSSQL();

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT} : http://localhost:${PORT}`);
});
