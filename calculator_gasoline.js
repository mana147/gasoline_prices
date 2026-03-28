// Calculator for gasoline surcharge based on DO fuel price and container type

/*
"hang_20" = container hàng ≤ 20'
"hang_40" = container hàng ≥ 40'
"hang_45" = container hàng 45'
"rong_20" = container rỗng ≤ 20'
"rong_40" = container rỗng ≥ 40'
"rong_45" = container rỗng 45'
*/

// Bảng phụ thu theo giá dầu DO
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

/**
 * Tính giá cước theo giá dầu DO
 * @param {number} giaDauDO - Giá dầu DO hiện tại
 * @param {string} loaiContainer - Loại container: "hang_20", "hang_40", "hang_45", "rong_20", "rong_40", "rong_45"
 * @param {number} giaCuoc - Giá cước gốc
 * @returns {object} - Kết quả tính cước
 */
function tinhGiaCuocTheoDauDO(giaDauDO, loaiContainer, giaCuoc) {
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

// Export functions
module.exports = {
    tinhGiaCuocTheoDauDO,
    bangPhuThu
};
