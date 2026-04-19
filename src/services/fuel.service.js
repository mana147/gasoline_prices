const axios = require('axios');
const { tinhGiaCuocTheoDauDO } = require('../../calculator_gasoline');

const API_BASE_URL = process.env.API_BASE_URL || 'https://giaxanghomnay.com/api/pvdate/';
const API_TIMEOUT = parseInt(process.env.API_TIMEOUT) || 10000;

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

function getFuelByTitle(DATA, brand, title) {
    if (!DATA[brand]) return null;
    const data = DATA[brand].find(item => item.title === title);
    return {
        brand,
        id: data.id || null,
        date: data.date || null,
        title: data.title || null,
        zone1_price: data.zone1_price || 0,
        zone2_price: data.zone2_price || null
    };
}

async function fetchAndCalculateFuelPrice(date) {
    const apiData = await getFuelByDate(date);
    const result = getFuelByTitle(apiData, "petrolimex", "DO 0,05S-II");
    const giaDauDO = result.zone1_price || 0;

    return {
        date,
        brand: "petrolimex",
        title: "DO 0,05S-II",
        zone1_price: result.zone1_price,
        zone2_price: result.zone2_price,
        hang_20: tinhGiaCuocTheoDauDO(giaDauDO, "hang_20", 0).phuThu,
        hang_40: tinhGiaCuocTheoDauDO(giaDauDO, "hang_40", 0).phuThu,
        hang_45: tinhGiaCuocTheoDauDO(giaDauDO, "hang_45", 0).phuThu,
        rong_20: tinhGiaCuocTheoDauDO(giaDauDO, "rong_20", 0).phuThu,
        rong_40: tinhGiaCuocTheoDauDO(giaDauDO, "rong_40", 0).phuThu,
        rong_45: tinhGiaCuocTheoDauDO(giaDauDO, "rong_45", 0).phuThu
    };
}

module.exports = { getFuelByDate, getFuelByTitle, fetchAndCalculateFuelPrice };
