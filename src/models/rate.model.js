const ms_sql = require('mssql');

const SELECT_TRF_STD = `
SELECT TRF_CODE , AMT_F20 , AMT_F40 , AMT_F45 , AMT_E20 , AMT_E40 , AMT_E45
FROM [PRD_MPC].[dbo].[TRF_STD]
WHERE rowguid in(
    'ec426c93-0598-4d4e-9b64-6fae5eefb596', -- NH
    'd5af4366-62e0-4459-bdea-d9e65132813e', -- HH
    '084e21e5-3684-4d41-b00c-c83085a6752a', -- NR
    'e4f41ae6-9fc4-4ae4-97ae-ef9c0624cd19'  -- HR
)`;

const QUERIES = {
    NH: {
        sql: `UPDATE [PRD_MPC].[dbo].[TRF_STD] SET AMT_F20 = @AMT_F20, AMT_F40 = @AMT_F40, AMT_F45 = @AMT_F45 WHERE rowguid = 'ec426c93-0598-4d4e-9b64-6fae5eefb596'`,
        fields: [['AMT_F20', 'hang_20'], ['AMT_F40', 'hang_40'], ['AMT_F45', 'hang_45']]
    },
    HH: {
        sql: `UPDATE [PRD_MPC].[dbo].[TRF_STD] SET AMT_F20 = @AMT_F20, AMT_F40 = @AMT_F40, AMT_F45 = @AMT_F45 WHERE rowguid = 'd5af4366-62e0-4459-bdea-d9e65132813e'`,
        fields: [['AMT_F20', 'hang_20'], ['AMT_F40', 'hang_40'], ['AMT_F45', 'hang_45']]
    },
    NR: {
        sql: `UPDATE [PRD_MPC].[dbo].[TRF_STD] SET AMT_E20 = @AMT_E20, AMT_E40 = @AMT_E40, AMT_E45 = @AMT_E45 WHERE rowguid = '084e21e5-3684-4d41-b00c-c83085a6752a'`,
        fields: [['AMT_E20', 'rong_20'], ['AMT_E40', 'rong_40'], ['AMT_E45', 'rong_45']]
    },
    HR: {
        sql: `UPDATE [PRD_MPC].[dbo].[TRF_STD] SET AMT_E20 = @AMT_E20, AMT_E40 = @AMT_E40, AMT_E45 = @AMT_E45 WHERE rowguid = 'e4f41ae6-9fc4-4ae4-97ae-ef9c0624cd19'`,
        fields: [['AMT_E20', 'rong_20'], ['AMT_E40', 'rong_40'], ['AMT_E45', 'rong_45']]
    }
};

async function getTrfStd(pool) {
    const result = await pool.request().query(SELECT_TRF_STD);
    return result.recordset;
}

async function updateTrfStd(pool, trf_code, params) {
    const { sql, fields } = QUERIES[trf_code];
    const request = pool.request();
    for (const [col, key] of fields) {
        request.input(col, ms_sql.Decimal(18, 2), params[key]);
    }
    const result = await request.query(sql);
    return result.rowsAffected[0];
}

module.exports = { getTrfStd, updateTrfStd };
