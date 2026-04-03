// Import necessary modules
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const ms_sql = require('mssql');
const axios = require("axios");
const sqlite3 = require('sqlite3').verbose();
const { tinhGiaCuocTheoDauDO, bangPhuThu } = require('./calculator_gasoline');
const { activeTokens, generateToken, authMiddleware, adminMiddleware } = require('./middleware/auth');
const { router: authRouter, initDB: initAuthDB } = require('./controller/authController');

// Load environment variables from .env file
require('dotenv').config();

// Initialize the app
const app = express();
const PORT = process.env.PORT || 8000;
const API_BASE_URL = process.env.API_BASE_URL || 'https://giaxanghomnay.com/api/pvdate/';
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT) || 10000; // 10 seconds
const SQLITE_DB_PATH = process.env.SQLITE_DB_PATH || './database/fuel_data.db';

// --------------------------------------------------------------------

// Middleware
app.use(cors());
app.use(bodyParser.json());

// config public folder to serve static files (html, css, js)
app.use(express.static(path.join(__dirname, 'public')));

// Database configuration
const dbConfig = {
    user: process.env.MSSQL_USER,
    password: process.env.MSSQL_PASSWORD,
    server: process.env.MSSQL_SERVER,
    database: process.env.MSSQL_DATABASE,
    options: {
        encrypt: process.env.MSSQL_ENCRYPT === 'true',
        trustServerCertificate: process.env.MSSQL_TRUST_SERVER_CERTIFICATE === 'true'
    }
};

// check Connect to the database
ms_sql.connect(dbConfig).then(pool => {
    if (pool.connected) console.log('> LOG: Connected to SQL Server -', dbConfig.server);
    else console.log('> LOG: Failed to connect to SQL Server -', dbConfig.server);
}).catch(err => {
    console.error('> ERROR: Database connection failed: ', err.message);
});

// sql SELECT lấy biểu cước hiện tại trong bảng TRF_STD cho 4 loại cước: NH, HH, NR, HR
let SELECT_TRF_STD = `
SELECT TRF_CODE , AMT_F20 , AMT_F40 , AMT_F45 , AMT_E20 , AMT_E40 , AMT_E45 
FROM [PRD_MPC].[dbo].[TRF_STD]
WHERE rowguid in( 
    'ec426c93-0598-4d4e-9b64-6fae5eefb596', -- NH
    'd5af4366-62e0-4459-bdea-d9e65132813e', -- HH
    '084e21e5-3684-4d41-b00c-c83085a6752a', -- NR
    'e4f41ae6-9fc4-4ae4-97ae-ef9c0624cd19'  -- HR 
)`;

let UPDATE_TRF_STD_NH = `
UPDATE [PRD_MPC].[dbo].[TRF_STD] 
SET AMT_F20 = @AMT_F20 ,
    AMT_F40 = @AMT_F40 , 
    AMT_F45 = @AMT_F45 
WHERE rowguid = 'ec426c93-0598-4d4e-9b64-6fae5eefb596' `;

let UPDATE_TRF_STD_HH = `
UPDATE [PRD_MPC].[dbo].[TRF_STD] 
SET AMT_F20 = @AMT_F20 ,
    AMT_F40 = @AMT_F40 , 
    AMT_F45 = @AMT_F45 
WHERE rowguid = 'd5af4366-62e0-4459-bdea-d9e65132813e' `;

let UPDATE_TRF_STD_NR = `
UPDATE [PRD_MPC].[dbo].[TRF_STD] 
SET AMT_E20 = @AMT_E20 ,
    AMT_E40 = @AMT_E40 , 
    AMT_E45 = @AMT_E45 
WHERE rowguid = '084e21e5-3684-4d41-b00c-c83085a6752a' `;

let UPDATE_TRF_STD_HR = `
UPDATE [PRD_MPC].[dbo].[TRF_STD] 
SET AMT_E20 = @AMT_E20 ,
    AMT_E40 = @AMT_E40 , 
    AMT_E45 = @AMT_E45 
WHERE rowguid = 'e4f41ae6-9fc4-4ae4-97ae-ef9c0624cd19' `;
// --------------------------------------------------------------------

// database sqlite configuration
const sqlite_db = new sqlite3.Database(SQLITE_DB_PATH, (err) => {
    if (err) console.error('> ERROR: Could not connect to SQLite database:', err.message);
    else console.log('> LOG: Connected to SQLite database -' + SQLITE_DB_PATH);
});

// Initialize auth controller with sqlite_db
initAuthDB(sqlite_db);

// Use auth routes
app.use('/', authRouter);

// --------------------------------------------------------------------

// Function to get fuel data by date from the API https://giaxanghomnay.com/api/pvdate/{date}
async function getFuelByDate(date) {
    const url = API_BASE_URL + `${date}`;
    const { data } = await axios.get(url, {
        timeout: API_TIMEOUT,
        headers: { "Accept": "application/json" }
    });
    const [petrolimexToday, pvoilToday, petrolimexPrev, pvoilPrev] = data;
    return {
        date,
        petrolimex: petrolimexToday || [],
        pvoil: pvoilToday || [],
        previous_petrolimex: petrolimexPrev || [],
        previous_pvoil: pvoilPrev || []
    };
}

// Function to get Petrolimex fuel data by ID from the fetched data
function getFuelByTitle(DATA, brand, title) {
    if (!DATA[brand]) return null;
    let data = DATA[brand].find(item => item.title === title);
    return {
        brand: brand,
        id: data.id || null,
        date: data.date || null,
        title: data.title || null,
        zone1_price: data.zone1_price || 0,
        zone2_price: data.zone2_price || null
    }
}


// ============================================================================
// API ROUTES
// ============================================================================

// Define a simple route to serve the main page
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/view/index.html');
});

// api lấy giá nhiên liệu DO 0,05S-II của Petrolimex từ API https://giaxanghomnay.com/api/pvdate/{date} 
// với date là ngày hiện tại và tính cước phụ thu theo bảng phụ thu đã cho ở trên với giá nhiên liệu DO 0,05S-II lấy được từ API và loại container là "hang_20", "hang_40", "hang_45" ,  "rong_20", "rong_40", "rong_45" 
// rồi lưu kết quả vào database sqlite và trả về kết quả tính cước phụ thu cho từng loại container trên console
// ví dụ : localhost:3000/api/get_fuel_price?date=2026-03-25 
app.get('/api/get_fuel_price', authMiddleware, async (req, res) => {
    try {
        // Get date from query or use today's date
        let date = req.query.date || new Date().toISOString().split('T')[0];

        // kiểm tra nếu date không hợp lệ thì trả về lỗi
        if (isNaN(Date.parse(date))) {
            date = new Date().toISOString().split('T')[0]; // Use today's date if invalid
        }

        // // kiểm tra trong database sqlite đã có dữ liệu cho ngày date và brand petrolimex và title DO 0,05S-II chưa, nếu có rồi thì trả về dữ liệu đó mà không gọi API nữa
        // const existingData = await new Promise((resolve, reject) => {
        //     sqlite_db.get(`SELECT * FROM fuel_prices WHERE date = ? AND brand = ? AND title = ?`,
        //         [date, "petrolimex", "DO 0,05S-II"],
        //         (err, row) => {
        //             if (err) reject(err);
        //             else resolve(row);
        //         });
        // });

        // // nếu đã có dữ liệu thì trả về dữ liệu đó mà không gọi API nữa
        // if (existingData) { return res.json(existingData); }

        // lấy dữ liệu giá nhiên liệu DO 0,05S-II của Petrolimex từ API https://giaxanghomnay.com/api/pvdate/{date} với date là ngày hiện tại
        const apiData = await getFuelByDate(date);
        const result = getFuelByTitle(apiData, "petrolimex", "DO 0,05S-II");
        const giaDauDO = result.zone1_price || 0; // Use actual DO price from Petrolimex data or default to 0

        // tính cước phụ thu theo bảng phụ thu đã cho ở trên với giá nhiên liệu DO 0,05S-II lấy được từ API và loại container là "hang_20", "hang_40", "hang_45" ,  "rong_20", "rong_40", "rong_45" 

        const hang_20 = tinhGiaCuocTheoDauDO(giaDauDO, "hang_20", 0);
        const hang_40 = tinhGiaCuocTheoDauDO(giaDauDO, "hang_40", 0);
        const hang_45 = tinhGiaCuocTheoDauDO(giaDauDO, "hang_45", 0);

        const rong_20 = tinhGiaCuocTheoDauDO(giaDauDO, "rong_20", 0);
        const rong_40 = tinhGiaCuocTheoDauDO(giaDauDO, "rong_40", 0);
        const rong_45 = tinhGiaCuocTheoDauDO(giaDauDO, "rong_45", 0);

        // lưu kết quả tính cước phụ thu vào database sqlite với các trường: date, brand, title, zone1_price, zone2_price (nếu có), hang_20, hang_40, hang_45, rong_20, rong_40, rong_45 , status , createdAt
        const stmt = sqlite_db.prepare(`INSERT INTO fuel_prices 
            (date, brand, title, zone1_price, zone2_price, hang_20, hang_40, hang_45, rong_20, rong_40, rong_45, status, createdAt) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run(
            date,
            "petrolimex",
            "DO 0,05S-II",
            result.zone1_price,
            result.zone2_price,
            hang_20.phuThu,
            hang_40.phuThu,
            hang_45.phuThu,
            rong_20.phuThu,
            rong_40.phuThu,
            rong_45.phuThu,
            'active',
            new Date().toISOString()
        );
        stmt.finalize();

        res.json({
            date,
            brand: "petrolimex",
            title: "DO 0,05S-II",
            zone1_price: result.zone1_price,
            zone2_price: result.zone2_price,
            hang_20: hang_20.phuThu,
            hang_40: hang_40.phuThu,
            hang_45: hang_45.phuThu,
            rong_20: rong_20.phuThu,
            rong_40: rong_40.phuThu,
            rong_45: rong_45.phuThu
        });
    } catch (err) {
        console.error('Error fetching fuel price:', err);
        res.status(500).json({ error: 'Failed to fetch fuel price' });
    }
});


// api lấy dữ liêu trong bảng TRF_STD của SQL Server với 4 loại cước: NH, HH, NR, HR và in ra console
app.get('/api/get_trf_std', authMiddleware, async (req, res) => {
    try {
        let pool = await ms_sql.connect(dbConfig);
        let result_SELECT_TRF_STD = (await pool.request().query(SELECT_TRF_STD)).recordset;

        // format result_SELECT_TRF_STD to object with key is TRF_CODE and value is an object with keys hang_20, hang_40, hang_45, rong_20, rong_40, rong_45 and values are corresponding values from result_SELECT_TRF_STD
        let formattedResult = {};
        result_SELECT_TRF_STD.forEach(item => {
            formattedResult[item.TRF_CODE] = {
                hang_20: item.AMT_F20 || 0,
                hang_40: item.AMT_F40 || 0,
                hang_45: item.AMT_F45 || 0,
                rong_20: item.AMT_E20 || 0,
                rong_40: item.AMT_E40 || 0,
                rong_45: item.AMT_E45 || 0
            };
        });

        res.json(formattedResult);

    } catch (err) {
        console.error('Error fetching TRF_STD data:', err);
        res.status(500).json({ error: 'Failed to fetch TRF_STD data' });
    }
});

// api update lại giá cước NH, HH, NR, HR trong bảng TRF_STD 
// api update bằng POST với body có các trường: trf_code, hang_20, hang_40, hang_45, rong_20, rong_40, rong_45

app.post('/api/update_trf_std', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { trf_code, hang_20, hang_40, hang_45, rong_20, rong_40, rong_45 } = req.body;

        // Validate trf_code
        const validCodes = ['NH', 'HH', 'NR', 'HR'];
        if (!trf_code || !validCodes.includes(trf_code)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid trf_code. Must be one of: NH, HH, NR, HR'
            });
        }

        let pool = await ms_sql.connect(dbConfig);
        let request = pool.request();
        let result;

        switch (trf_code) {
            case 'NH':
                // NH uses hang values (AMT_F20, AMT_F40, AMT_F45)
                if (hang_20 === undefined || hang_40 === undefined || hang_45 === undefined) {
                    return res.status(400).json({
                        success: false,
                        error: 'NH requires hang_20, hang_40, hang_45 values'
                    });
                }
                request.input('AMT_F20', ms_sql.Decimal(18, 2), hang_20);
                request.input('AMT_F40', ms_sql.Decimal(18, 2), hang_40);
                request.input('AMT_F45', ms_sql.Decimal(18, 2), hang_45);
                result = await request.query(UPDATE_TRF_STD_NH);
                break;

            case 'HH':
                // HH uses hang values (AMT_F20, AMT_F40, AMT_F45)
                if (hang_20 === undefined || hang_40 === undefined || hang_45 === undefined) {
                    return res.status(400).json({
                        success: false,
                        error: 'HH requires hang_20, hang_40, hang_45 values'
                    });
                }
                request.input('AMT_F20', ms_sql.Decimal(18, 2), hang_20);
                request.input('AMT_F40', ms_sql.Decimal(18, 2), hang_40);
                request.input('AMT_F45', ms_sql.Decimal(18, 2), hang_45);
                result = await request.query(UPDATE_TRF_STD_HH);
                break;

            case 'NR':
                // NR uses rong values (AMT_E20, AMT_E40, AMT_E45)
                if (rong_20 === undefined || rong_40 === undefined || rong_45 === undefined) {
                    return res.status(400).json({
                        success: false,
                        error: 'NR requires rong_20, rong_40, rong_45 values'
                    });
                }

                request.input('AMT_E20', ms_sql.Decimal(18, 2), rong_20);
                request.input('AMT_E40', ms_sql.Decimal(18, 2), rong_40);
                request.input('AMT_E45', ms_sql.Decimal(18, 2), rong_45);
                result = await request.query(UPDATE_TRF_STD_NR);

                break;

            case 'HR':
                // HR uses rong values (AMT_E20, AMT_E40, AMT_E45)
                if (rong_20 === undefined || rong_40 === undefined || rong_45 === undefined) {
                    return res.status(400).json({
                        success: false,
                        error: 'HR requires rong_20, rong_40, rong_45 values'
                    });
                }
                request.input('AMT_E20', ms_sql.Decimal(18, 2), rong_20);
                request.input('AMT_E40', ms_sql.Decimal(18, 2), rong_40);
                request.input('AMT_E45', ms_sql.Decimal(18, 2), rong_45);
                result = await request.query(UPDATE_TRF_STD_HR);
                break;
        }

        res.json({
            success: true,
            message: `Cập nhật ${trf_code} thành công`,
            rowsAffected: result.rowsAffected[0]
        });

    } catch (err) {
        console.error('Error updating TRF_STD data:', err);
        res.status(500).json({
            success: false,
            error: 'Failed to update TRF_STD data',
            details: err.message
        });
    }
});

// api lấy Bảng phụ thu theo giá dầu DO
app.get('/api/get_surcharge_table', (req, res) => {
    res.json(bangPhuThu);
});

// -----------------------------------------------------------------------------------------------------

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});