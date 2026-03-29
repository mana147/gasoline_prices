// Import necessary modules
const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const ms_sql = require('mssql');
const axios = require("axios");
const sqlite3 = require('sqlite3').verbose();
const crypto = require('crypto');
const { tinhGiaCuocTheoDauDO } = require('./calculator_gasoline');

// Token storage (in-memory - use Redis for production)
const activeTokens = new Map();

// Initialize the app
const app = express();
const PORT = process.env.PORT || 8000;
const API_BASE_URL = 'https://giaxanghomnay.com/api/pvdate/';
const API_TIMEOUT = 10000; // 10 seconds
const SQLITE_DB_PATH = './database/fuel_data.db';

// --------------------------------------------------------------------

// Middleware
app.use(cors());
app.use(bodyParser.json());

// config public folder to serve static files (html, css, js)
app.use(express.static(path.join(__dirname, 'public')));

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
const sqlite_db = new sqlite3.Database(SQLITE_DB_PATH, (err) => {
    if (err) console.error('> ERROR: Could not connect to SQLite database:', err.message);
    else console.log('> LOG: Connected to SQLite database -' + SQLITE_DB_PATH);
});

// Create fuel_prices table if it doesn't exist
// sqlite_db.serialize(() => {
//     sqlite_db.run(`CREATE TABLE IF NOT EXISTS fuel_prices (
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
        let pool = await ms_sql.connect(dbConfig);
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
        const stmt = sqlite_db.prepare(`
            INSERT INTO fuel_prices 
            (date, brand, title, zone1_price, zone2_price, hang_20, hang_40, hang_45, rong_20, rong_40, rong_45, status, createdAt) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

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
        console.error('> ERROR : Error in maintest - ', err);
    }
};

// maintest();

// ============================================================================
// AUTH API - Login, Register, Users
// ============================================================================

// Generate random token
function generateToken() {
    return crypto.randomBytes(32).toString('hex');
}

// Middleware xác thực token
function authMiddleware(req, res, next) {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Chưa đăng nhập. Vui lòng cung cấp token!'
        });
    }

    const userData = activeTokens.get(token);
    if (!userData) {
        return res.status(401).json({
            success: false,
            message: 'Token không hợp lệ hoặc đã hết hạn!'
        });
    }

    // Check token expiry (24 hours)
    if (Date.now() > userData.expiresAt) {
        activeTokens.delete(token);
        return res.status(401).json({
            success: false,
            message: 'Token đã hết hạn. Vui lòng đăng nhập lại!'
        });
    }

    req.user = userData.user;
    req.token = token;
    next();
}

// Middleware kiểm tra quyền admin
function adminMiddleware(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Không có quyền truy cập. Chỉ admin mới được phép!'
        });
    }
    next();
}

// ============================================================================

// Define a simple route
app.get('/', authMiddleware, (req, res) => {
    // tạo giao diện đơn giản để hiển thị thông tin về dịch vụ tính cước phụ thu nhiên liệu DO của MPC
    // res từ index.html trong thư mục view
    res.sendFile(__dirname + '/view/index.html');
    // res.send('service for MPC fuel price and surcharge calculation');
});

// Route đăng nhập
app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/view/login.html');
});

// ví dụ : localhost:3000/api/get_fuel_price?date=2026-03-25 
app.get('/api/get_fuel_price', async (req, res) => {
    try {
        let date = req.query.date || new Date().toISOString().split('T')[0]; // Get date from query or use today's date

        console.log('date_in :>> ', date);

        // lấy dữ liệu giá nhiên liệu DO 0,05S-II của Petrolimex từ API https://giaxanghomnay.com/api/pvdate/{date} với date là ngày hiện tại

        // let date = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
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

// POST /api/login - Đăng nhập
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Vui lòng nhập username và password'
        });
    }

    const query = `SELECT id, username, email, full_name, role, status, created_at, last_login
                   FROM users 
                   WHERE username = ? AND password = ? AND status = 'active'`;

    sqlite_db.get(query, [username, password], (err, user) => {
        if (err) {
            console.error('Login error:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Username hoặc password không đúng'
            });
        }

        // Generate token
        const token = generateToken();
        const expiresAt = Date.now() + (24 * 60 * 60 * 1000); // 24 hours

        // Store token
        activeTokens.set(token, {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role
            },
            expiresAt
        });

        // Update last_login
        sqlite_db.run(`UPDATE users SET last_login = ? WHERE id = ?`,
            [new Date().toISOString(), user.id]);

        res.json({
            success: true,
            message: 'Đăng nhập thành công',
            token,
            expiresIn: '24h',
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                full_name: user.full_name,
                role: user.role
            }
        });
    });
});

// POST /api/logout - Đăng xuất
app.post('/api/logout', authMiddleware, (req, res) => {
    activeTokens.delete(req.token);
    res.json({
        success: true,
        message: 'Đăng xuất thành công'
    });
});

// GET /api/me - Lấy thông tin user hiện tại
app.get('/api/me', authMiddleware, (req, res) => {
    res.json({
        success: true,
        user: req.user
    });
});

// POST /api/register - Đăng ký
app.post('/api/register', (req, res) => {
    const { username, password, email, full_name } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            message: 'Vui lòng nhập username và password'
        });
    }

    // Check if username exists
    sqlite_db.get(`SELECT id FROM users WHERE username = ?`, [username], (err, existing) => {
        if (err) {
            console.error('Register error:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }

        if (existing) {
            return res.status(409).json({
                success: false,
                message: 'Username đã tồn tại'
            });
        }

        // Insert new user
        const query = `INSERT INTO users (username, password, email, full_name, role, status, created_at, updated_at) 
                       VALUES (?, ?, ?, ?, 'user', 'active', ?, ?)`;
        const now = new Date().toISOString();

        sqlite_db.run(query, [username, password, email || null, full_name || null, now, now], function (err) {
            if (err) {
                console.error('Register insert error:', err);
                return res.status(500).json({
                    success: false,
                    message: 'Lỗi khi tạo tài khoản'
                });
            }

            res.status(201).json({
                success: true,
                message: 'Đăng ký thành công',
                user: {
                    id: this.lastID,
                    username,
                    email,
                    full_name,
                    role: 'user'
                }
            });
        });
    });
});

// GET /api/users - Lấy danh sách users (chỉ admin)
app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
    const query = `SELECT id, username, email, full_name, role, status, created_at, last_login 
                   FROM users 
                   ORDER BY created_at DESC`;

    sqlite_db.all(query, [], (err, users) => {
        if (err) {
            console.error('Get users error:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }

        res.json({
            success: true,
            count: users.length,
            users
        });
    });
});

// GET /api/users/:id - Lấy thông tin user theo ID
app.get('/api/users/:id', authMiddleware, (req, res) => {
    const { id } = req.params;

    const query = `SELECT id, username, email, full_name, role, status, created_at, last_login 
                   FROM users 
                   WHERE id = ?`;

    sqlite_db.get(query, [id], (err, user) => {
        if (err) {
            console.error('Get user error:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }

        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy user'
            });
        }

        res.json({
            success: true,
            user
        });
    });
});

// PUT /api/users/:id - Cập nhật thông tin user
app.put('/api/users/:id', authMiddleware, (req, res) => {
    const { id } = req.params;
    const { email, full_name, role, status } = req.body;

    const query = `UPDATE users 
                   SET email = COALESCE(?, email),
                       full_name = COALESCE(?, full_name),
                       role = COALESCE(?, role),
                       status = COALESCE(?, status),
                       updated_at = ?
                   WHERE id = ?`;

    sqlite_db.run(query, [email, full_name, role, status, new Date().toISOString(), id], function (err) {
        if (err) {
            console.error('Update user error:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy user'
            });
        }

        res.json({
            success: true,
            message: 'Cập nhật thành công'
        });
    });
});

// DELETE /api/users/:id - Xóa user (chỉ admin)
app.delete('/api/users/:id', authMiddleware, adminMiddleware, (req, res) => {
    const { id } = req.params;

    sqlite_db.run(`DELETE FROM users WHERE id = ?`, [id], function (err) {
        if (err) {
            console.error('Delete user error:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server'
            });
        }

        if (this.changes === 0) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy user'
            });
        }

        res.json({
            success: true,
            message: 'Xóa user thành công'
        });
    });
});

// ============================================================================

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});