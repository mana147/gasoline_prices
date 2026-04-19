function insertFuelPrice(db, record) {
    return new Promise((resolve, reject) => {
        const stmt = db.prepare(`INSERT INTO fuel_prices
            (date, brand, title, zone1_price, zone2_price, hang_20, hang_40, hang_45, rong_20, rong_40, rong_45, status, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
        stmt.run(
            record.date,
            record.brand,
            record.title,
            record.zone1_price,
            record.zone2_price,
            record.hang_20,
            record.hang_40,
            record.hang_45,
            record.rong_20,
            record.rong_40,
            record.rong_45,
            record.status || 'active',
            record.createdAt || new Date().toISOString(),
            (err) => { if (err) reject(err); else resolve(); }
        );
        stmt.finalize();
    });
}

function findFuelPrice(db, date, brand, title) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT * FROM fuel_prices WHERE date = ? AND brand = ? AND title = ?`,
            [date, brand, title],
            (err, row) => {
                if (err) reject(err);
                else resolve(row);
            }
        );
    });
}

module.exports = { insertFuelPrice, findFuelPrice };
