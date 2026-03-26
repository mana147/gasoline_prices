// Import necessary modules
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sql = require('mssql');
const axios = require("axios");
const sqlite3 = require('sqlite3').verbose();

// Initialize the app
const app = express();
const PORT = process.env.PORT || 8000;
const API_BASE_URL = 'https://giaxanghomnay.com/api/pvdate/';
const API_TIMEOUT = 10000; // 10 seconds
const SQLITE_DB_PATH = './DB/fuel_data.db';

// --------------------------------------------------------------------

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Database configuration
const dbConfig = {
    user: 'sa',
    password: 'adminlocal@123',
    server: '172.16.10.8\\MPC',
    database: 'PRD_MPC',
    options: {
        encrypt: false,                     // Use encryption
        trustServerCertificate: true        // Change to false for production
    }
};

// Connect to the database
sql.connect(dbConfig).then(pool => {
    if (pool.connected) console.log('Connected to SQL Server -', dbConfig.server);
    else console.log('Failed to connect to SQL Server')
}).catch(err => {
    console.error('Database connection failed:', err);
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
) `;

let UPDATE_TRF_STD_NH = `
UPDATE [PRD_MPC].[dbo].[TRF_STD] 
SET AMT_F20 = @AMT_F20 ,
    AMT_F40 = @AMT_F40 , 
    AMT_F45 = @AMT_F45 
WHERE rowguid = 'ec426c93-0598-4d4e-9b64-6fae5eefb596' `;

let UPDATE_TRF_STD_HH = `
UPDATE [PRD_MPC].[dbo].[TRF_STD] 
SET AMT_F20 = @AMT_F20,
    AMT_F40 = @AMT_F40 , 
    AMT_F45 = @AMT_F45 
WHERE rowguid = 'd5af4366-62e0-4459-bdea-d9e65132813e' `;

let UPDATE_TRF_STD_NR = `
UPDATE [PRD_MPC].[dbo].[TRF_STD] 
SET AMT_F20 = @AMT_E20,
    AMT_F40 = @AMT_E40 , 
    AMT_F45 = @AMT_E45 
WHERE rowguid = '084e21e5-3684-4d41-b00c-c83085a6752a' `;

let UPDATE_TRF_STD_HR = `
UPDATE [PRD_MPC].[dbo].[TRF_STD] 
SET AMT_F20 = @AMT_E20,
    AMT_F40 = @AMT_E40 , 
    AMT_F45 = @AMT_E45 
WHERE rowguid = 'e4f41ae6-9fc4-4ae4-97ae-ef9c0624cd19' `;
// --------------------------------------------------------------------

// database sqlite configuration
const db = new sqlite3.Database(SQLITE_DB_PATH, (err) => {
    if (err) console.error('Could not connect to SQLite database:', err);
    else console.log('Connected to SQLite database');
});

// Create fuel_prices table if it doesn't exist
// db.serialize(() => {
//     db.run(`CREATE TABLE IF NOT EXISTS fuel_prices (
//         id INTEGER PRIMARY KEY AUTOINCREMENT,
//         date TEXT,
//         brand TEXT,
//         title TEXT,
//         zone1_price REAL,
//         zone2_price REAL,
//         hang_20 REAL,
//         hang_40 REAL,
//         hang_45 REAL,
//         rong_20 REAL,
//         rong_40 REAL,
//         rong_45 REAL,
//         status TEXT DEFAULT 'active',
//         createdAt TEXT
//     )`);
// });

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

// Function to calculate surcharge based on DO fuel price and container type
/*
"hang_20" = container hàng ≤ 20'
"hang_40" = container hàng ≥ 40'
"rong_20" = container rỗng ≤ 20'
"rong_40" = container rỗng ≥ 40'
*/
function tinhGiaCuocTheoDauDO(giaDauDO, loaiContainer, giaCuoc) {
    const bangPhuThu = [
        {
            min: 0,
            max: 23000,
            surcharge: {
                "hang_20": 0,
                "hang_40": 0,
                "hang_45": 0,

                "rong_20": 0,
                "rong_40": 0,
                "rong_45": 0,
            },
        },
        {
            min: 23001,
            max: 26000,
            surcharge: {
                "hang_20": 50000,
                "hang_40": 60000,
                "hang_45": 60000,

                "rong_20": 35000,
                "rong_40": 50000,
                "rong_45": 50000,
            },
        },
        {
            min: 26001,
            max: 29000,
            surcharge: {
                "hang_20": 100000,
                "hang_40": 120000,
                "hang_45": 120000,

                "rong_20": 70000,
                "rong_40": 100000,
                "rong_45": 100000,
            },
        },
        {
            min: 29001,
            max: 32000,
            surcharge: {
                "hang_20": 150000,
                "hang_40": 180000,
                "hang_45": 180000,

                "rong_20": 105000,
                "rong_40": 150000,
                "rong_45": 150000,
            },
        },
        {
            min: 32001,
            max: 35000,
            surcharge: {
                "hang_20": 200000,
                "hang_40": 240000,
                "hang_45": 240000,

                "rong_20": 140000,
                "rong_40": 200000,
                "rong_45": 200000,
            },
        },
        {
            min: 35001,
            max: 38000,
            surcharge: {
                "hang_20": 250000,
                "hang_40": 300000,
                "hang_45": 300000,

                "rong_20": 175000,
                "rong_40": 250000,
                "rong_45": 250000,
            },
        },
        {
            min: 38001,
            max: 41000,
            surcharge: {
                "hang_20": 300000,
                "hang_40": 360000,
                "hang_45": 360000,

                "rong_20": 210000,
                "rong_40": 300000,
                "rong_45": 300000,
            },
        },
        {
            min: 41001,
            max: 44000,
            surcharge: {
                "hang_20": 350000,
                "hang_40": 420000,
                "hang_45": 420000,

                "rong_20": 245000,
                "rong_40": 350000,
                "rong_45": 350000,
            },
        },
        {
            min: 44001,
            max: 47000,
            surcharge: {
                "hang_20": 400000,
                "hang_40": 480000,
                "hang_45": 480000,

                "rong_20": 280000,
                "rong_40": 400000,
                "rong_45": 400000,
            },
        },
        {
            min: 47001,
            max: 50000,
            surcharge: {
                "hang_20": 450000,
                "hang_40": 540000,
                "hang_45": 540000,

                "rong_20": 315000,
                "rong_40": 450000,
                "rong_45": 450000,
            },
        },
    ];

    const muc = bangPhuThu.find(
        (item) => giaDauDO >= item.min && giaDauDO <= item.max
    );

    if (!muc) {
        throw new Error("Giá dầu DO ngoài phạm vi bảng phụ thu");
    }

    if (!muc.surcharge.hasOwnProperty(loaiContainer)) {
        throw new Error("Loại container không hợp lệ");
    }

    const phuThu = muc.surcharge[loaiContainer];
    const tongTien = giaCuoc + phuThu;

    return {
        giaDauDO,
        loaiContainer,
        giaCuoc,
        phuThu,
        tongTien,
    };
}

// Define main function to execute queries
async function main() {
    try {
        // Create a new connection pool for each query execution
        let date = "2026-03-25"; // Example date, can be dynamic
        let dete_today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
        let company = "petrolimex";
        let title = "DO 0,05S-II";

        // Fetch fuel data for the specified date and extract Petrolimex DO 0,05S-II price
        const apiData = await getFuelByDate(date);
        // console.log('apiData :>> ', apiData);
        const result = getFuelByTitle(apiData, company, title);

        console.log('data_Fuel DO :>> ', result.zone1_price);

        // let petrolimex = getPetrolimexById(data_Fuel, 7548);
        // call API to get fuel data by date and extract Petrolimex data for ID 7548
        // console.log("Petrolimex data for ID 7548:", petrolimex);


        // Example DO fuel price for testing
        const giaDauDO = result.zone1_price; // Use actual DO price from Petrolimex data or default to 0
        // Ví dụ 1: contÍainer hàng 20 feet, giá cước gốc 2.000.000

        const hang_20 = tinhGiaCuocTheoDauDO(giaDauDO, "hang_20", 0);
        const hang_40 = tinhGiaCuocTheoDauDO(giaDauDO, "hang_40", 0);
        const rong_20 = tinhGiaCuocTheoDauDO(giaDauDO, "rong_20", 0);
        const rong_40 = tinhGiaCuocTheoDauDO(giaDauDO, "rong_40", 0);

        console.log("Kết quả tính cước cho container hàng 20 feet:", hang_20);
        console.log("Kết quả tính cước cho container hàng 40 feet:", hang_40);

        console.log("Kết quả tính cước cho container rỗng 20 feet:", rong_20);
        console.log("Kết quả tính cước cho container rỗng 40 feet:", rong_40);

        // console.log(JSON.stringify(data_Fuel, null, 2));

    } catch (err) {
        console.error('Query execution failed:', err);
        throw err;
    }
};
// run main function
// main();

async function maintest() {
    try {

        // define panding for main fuction
        /* 
        - lấy dữ liệu giá nhiên liệu DO 0,05S-II của Petrolimex từ API https://giaxanghomnay.com/api/pvdate/{date} với date là ngày hiện tại
        - tính cước phụ thu theo bảng phụ thu đã cho ở trên với giá nhiên liệu DO 0,05S-II lấy được từ API và loại container là "hang_20", "hang_40", "rong_20", "rong_40"
        - in ra kết quả tính cước phụ thu cho từng loại container trên console

        - lấy dữ liệu trong bảng TRF_STD của SQL Server với 4 loại cước: NH, HH, NR, HR và in ra console
        - cập nhật lại giá cước NH, HH, NR, HR trong bảng TRF_STD với giá cước mới tính được từ phụ thu của container hàng và in ra kết quả sau khi cập nhật   

        - lưu kết quả tính cước phụ thu vào database sqlite với các trường: date, brand, title, zone1_price, zone2_price (nếu có)
        */

        // connect to the database using the dbConfig
        let pool = await sql.connect(dbConfig);
        // let result_SELECT_TRF_STD = (await pool.request().query(SELECT_TRF_STD)).recordset;
        // console.log('result_SELECT_TRF_STD :>> ', result_SELECT_TRF_STD);


        // lấy dữ liệu giá nhiên liệu DO 0,05S-II của Petrolimex từ API https://giaxanghomnay.com/api/pvdate/{date} với date là ngày hiện tại

        let date = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
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

        // in ra kết quả tính cước phụ thu cho từng loại container trên console
        console.log("container hàng AMT_F20 :", hang_20.phuThu);
        console.log("container hàng AMT_F40 :", hang_40.phuThu);
        console.log("container hàng AMT_F45 :", hang_45.phuThu);

        console.log("container rỗng AMT_E20 :", rong_20.phuThu);
        console.log("container rỗng AMT_E40 :", rong_40.phuThu);
        console.log("container rỗng AMT_E45 :", rong_45.phuThu);

        /*
        tạo bảng database sqlite với các trường: id , date, brand, title, zone1_price, zone2_price , hang_20, hang_40, hang_45, rong_20, rong_40, rong_45 , status , createdAt. 
        - id: integer primary key autoincrement
        - date: text
        - brand: text
        - title: text
        - zone1_price: real
        - zone2_price: real
        - hang_20: real
        - hang_40: real
        - hang_45: real
        - rong_20: real
        - rong_40: real
        - rong_45: real
        - status: text (default 'active') e
        - createdAt: text (timestamp of when the record was created)    
        */

        // lưu kết quả tính cước phụ thu vào database sqlite với các trường: date, brand, title, zone1_price, zone2_price (nếu có), hang_20, hang_40, hang_45, rong_20, rong_40, rong_45 , status , createdAt
        const stmt = db.prepare(`INSERT INTO fuel_prices 
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


    } catch (err) {
        console.error('Error in maintest:', err);
    }
};

maintest();

// Define a simple route
app.get('/', (req, res) => {
    res.send('service for MPC fuel price and surcharge calculation');
});

app.get('/api/fuel-price', async (req, res) => {
    try {
        let date = req.query.date || new Date().toISOString().split('T')[0]; // Get date from query or use today's date
        const apiData = await getFuelByDate(date);
        res.json(apiData);
    } catch (err) {
        console.error('Error fetching fuel price:', err);
        res.status(500).json({ error: 'Failed to fetch fuel price' });
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});