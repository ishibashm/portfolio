import { calculateKyusei } from "../src/lib/kyusei";

const checkDate = (d: string) => {
  const date = new Date(d);
  const k = calculateKyusei(date);
  console.log(`--- ${d} ---`);
  console.log(`Year: ${k.year.star.name} (${k.year.star.number})`);
  console.log(`Month: ${k.month.star.name} (${k.month.star.number})`);
  console.log(`Day: ${k.day.star.name} (${k.day.star.number})`);
};

// User context: 2026-02-01 (Before Setsubun)
checkDate("2026-02-01T12:00:00+09:00");

// Next month (Feb 4+) - The "official" February 2026
checkDate("2026-02-05T12:00:00+09:00");
