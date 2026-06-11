import { calculateKyusei } from "../src/lib/kyusei";

const testDate = new Date("2026-01-31T12:00:00+09:00");
const result = calculateKyusei(testDate);

console.log(`Date: ${testDate.toISOString()}`);
console.log(`Year: ${testDate.getFullYear()}`);
console.log(
  `Calculated Year Star: ${result.year.star.name}, Number: ${result.year.star.number}`,
);
console.log(
  `Calculated Month Star: ${result.month.star.name}, Number: ${result.month.star.number}`,
);
console.log(
  `Calculated Day Star: ${result.day.star.name}, Number: ${result.day.star.number}`,
);

const expectedMonthNum = 9; // Kyushi
if (result.month.star.number === expectedMonthNum) {
  console.log("✅ Month Star is 9 (Kyushi) as expected by User.");
} else {
  console.log(
    `❌ Month Star is ${result.month.star.number} (${result.month.star.name}). Expected 9.`,
  );
}
