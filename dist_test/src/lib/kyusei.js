"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateKyusei = calculateKyusei;
const astronomy_engine_1 = require("astronomy-engine");
const STARS = [
    '九紫火星', '一白水星', '二黒土星',
    '三碧木星', '四緑木星', '五黄土星',
    '六白金星', '七赤金星', '八白土星'
];
function calculateKyusei(birthDate) {
    let year = birthDate.getFullYear();
    let month = birthDate.getMonth() + 1; // 1-12
    const day = birthDate.getDate();
    // --- Year / Month Logic (Same as before) ---
    const isBeforeSetsubun = (month === 1) || (month === 2 && day < 4);
    if (isBeforeSetsubun) {
        year -= 1;
    }
    const termStarts = [0, 6, 4, 6, 5, 6, 6, 7, 8, 8, 8, 7, 7];
    let solarMonth = month;
    if (day < termStarts[month]) {
        solarMonth -= 1;
    }
    if (solarMonth === 0)
        solarMonth = 12;
    let ySum = String(year).split('').reduce((a, b) => a + parseInt(b), 0);
    while (ySum > 9)
        ySum = String(ySum).split('').reduce((a, b) => a + parseInt(b), 0);
    let yearNum = 11 - ySum;
    if (yearNum > 9)
        yearNum = yearNum % 9;
    if (yearNum === 0)
        yearNum = 9;
    const group1 = [1, 4, 7];
    const group2 = [3, 6, 9];
    let baseFebStar = 0;
    if (group1.includes(yearNum))
        baseFebStar = 8;
    else if (group2.includes(yearNum))
        baseFebStar = 2;
    else
        baseFebStar = 5;
    let offset = (solarMonth === 1) ? 11 : solarMonth - 2;
    let monthNum = baseFebStar - offset;
    while (monthNum <= 0)
        monthNum += 9;
    while (monthNum > 9)
        monthNum -= 9;
    // --- Day Star Logic (Astronomical) ---
    const dayNum = calculateDayStar(birthDate);
    const getName = (n) => {
        const starMap = {
            1: '一白水星', 2: '二黒土星', 3: '三碧木星',
            4: '四緑木星', 5: '五黄土星', 6: '六白金星',
            7: '七赤金星', 8: '八白土星', 9: '九紫火星'
        };
        return starMap[n];
    };
    return {
        yearStar: getName(yearNum),
        monthStar: getName(monthNum),
        dayStar: getName(dayNum)
    };
}
function calculateDayStar(targetDate) {
    // 1. Determine if we are in Yang Ton (Winter Solstice to Summer Solstice) or Yin Ton (Summer to Winter)
    // Rule: Yoton (Yang) switch happens at Kinoe-Ne closest to Winter Solstice.
    //       Inton (Yin) switch happens at Kinoe-Ne closest to Summer Solstice.
    // We need to find the "Switch Date" applicable for the targetDate.
    // It could be the switch before the targetDate.
    // Work with UTC dates to avoid TZ issues logic, but user input is typically local.
    // Assume targetDate is user's local day (00:00:00).
    // Normalize to noon to be safe for astronomy calculation.
    const t = new Date(targetDate);
    t.setHours(12, 0, 0, 0);
    const tYear = t.getFullYear();
    // Get solstices for current year, prev year, next year to cover boundaries
    const checkYears = [tYear - 1, tYear, tYear + 1];
    let switchPoints = [];
    checkYears.forEach(y => {
        const seasons = (0, astronomy_engine_1.Seasons)(y);
        const summerSolstice = seasons.jun_solstice.date;
        const winterSolstice = seasons.dec_solstice.date;
        switchPoints.push({ date: getNearestKinoeNe(summerSolstice), type: 'YIN' }); // Summer -> Yin
        switchPoints.push({ date: getNearestKinoeNe(winterSolstice), type: 'YANG' }); // Winter -> Yang
    });
    // Sort switch points
    switchPoints.sort((a, b) => a.date.getTime() - b.date.getTime());
    // Find the latest switch point that is <= targetDate
    // default to something ancient if not found (shouldn't happen with correct years)
    let currentPeriod = switchPoints[0];
    for (const p of switchPoints) {
        if (p.date.getTime() <= t.getTime()) {
            currentPeriod = p;
        }
        else {
            break;
        }
    }
    // Calculate days elapsed since switch start
    // Start day (Kinoe-Ne) counts as Day 1.
    // Diff in milliseconds
    const diffTime = t.getTime() - currentPeriod.date.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24)); // 0-indexed offset
    // Day 1 of Yang Ton = Star 1 (Ascending 1, 2, 3...)
    // Day 1 of Yin Ton = Star 9 (Descending 9, 8, 7...)
    let star = 0;
    if (currentPeriod.type === 'YANG') {
        // Yang: 1 + offset
        // cycle is 1-9
        // (1 + diffDays - 1) % 9 + 1 ... wait
        // diffDays=0 (Kinoe-Ne) -> Star 1
        // diffDays=1 -> Star 2
        star = (1 + diffDays);
        // Normalize 1..9
        // (x - 1) % 9 + 1
        star = ((star - 1) % 9) + 1;
    }
    else {
        // Yin: 9 - offset
        // diffDays=0 -> Star 9
        // diffDays=1 -> Star 8
        // Star = 9 - (diffDays % 9)
        star = 9 - (diffDays % 9);
        if (star <= 0)
            star += 9;
    }
    return star;
}
// Helper: Find nearest Kinoe-Ne (甲子) to a given date
// Kinoe-Ne is index 0 in 60-day cycle.
// Anchor: 2024-01-01 was Kinoe-Ne (Mon).
const ANCHOR_KINOENE = new Date(2024, 0, 1, 12, 0, 0); // Jan 1 2024 Noon
function getNearestKinoeNe(baseDate) {
    const d = new Date(baseDate);
    d.setHours(12, 0, 0, 0);
    // Difference in days from Anchor
    const diffMs = d.getTime() - ANCHOR_KINOENE.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    // Cycle index of baseDate (can be negative)
    // Kinoe-Ne is when index % 60 == 0
    let remainder = diffDays % 60;
    if (remainder < 0)
        remainder += 60;
    // Nearest Kinoe-Ne could be upcoming or previous
    // If remainder is 0, today is Kinoe-Ne.
    // If remainder is 1, Kinoe-Ne was yesterday (-1).
    // If remainder is 59, Kinoe-Ne is tomorrow (+1).
    // Threshold is 30.
    let offset = 0;
    if (remainder < 30) {
        // Closer to previous Kinoe-Ne
        offset = -remainder;
    }
    else {
        // Closer to next Kinoe-Ne
        offset = 60 - remainder;
    }
    const result = new Date(d);
    result.setDate(d.getDate() + offset);
    return result;
}
