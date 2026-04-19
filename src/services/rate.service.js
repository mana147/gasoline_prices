const ms_sql = require('mssql');
const { mssqlConfig } = require('../config/db');
const rateModel = require('../models/rate.model');

const VALID_CODES = ['NH', 'HH', 'NR', 'HR'];

async function getRates() {
    const pool = await ms_sql.connect(mssqlConfig);
    const recordset = await rateModel.getTrfStd(pool);
    const formatted = {};
    recordset.forEach(item => {
        formatted[item.TRF_CODE] = {
            hang_20: item.AMT_F20 || 0,
            hang_40: item.AMT_F40 || 0,
            hang_45: item.AMT_F45 || 0,
            rong_20: item.AMT_E20 || 0,
            rong_40: item.AMT_E40 || 0,
            rong_45: item.AMT_E45 || 0
        };
    });
    return formatted;
}

async function updateRate(trf_code, values) {
    if (!trf_code || !VALID_CODES.includes(trf_code)) {
        const err = new Error('Invalid trf_code. Must be one of: NH, HH, NR, HR');
        err.status = 400;
        throw err;
    }

    const isHang = ['NH', 'HH'].includes(trf_code);
    if (isHang) {
        const { hang_20, hang_40, hang_45 } = values;
        if (hang_20 === undefined || hang_40 === undefined || hang_45 === undefined) {
            const err = new Error(`${trf_code} requires hang_20, hang_40, hang_45 values`);
            err.status = 400;
            throw err;
        }
    } else {
        const { rong_20, rong_40, rong_45 } = values;
        if (rong_20 === undefined || rong_40 === undefined || rong_45 === undefined) {
            const err = new Error(`${trf_code} requires rong_20, rong_40, rong_45 values`);
            err.status = 400;
            throw err;
        }
    }

    const pool = await ms_sql.connect(mssqlConfig);
    const rowsAffected = await rateModel.updateTrfStd(pool, trf_code, values);
    return rowsAffected;
}

module.exports = { getRates, updateRate };
