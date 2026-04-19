const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const authRouter = require('./routes/auth.routes');
const fuelRouter = require('./routes/fuel.routes');
const rateRouter = require('./routes/rate.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../view/index.html'));
});

app.use('/', authRouter);
app.use('/', fuelRouter);
app.use('/', rateRouter);

app.use(errorHandler);

module.exports = app;
