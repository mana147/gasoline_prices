const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const authRouter = require('./routes/auth.routes');
const fuelRouter = require('./routes/fuel.routes');
const rateRouter = require('./routes/rate.routes');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
    res.render('index');
});

app.use('/', authRouter);
app.use('/', fuelRouter);
app.use('/', rateRouter);

app.use(errorHandler);

module.exports = app;
