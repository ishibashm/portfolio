
import { calculateKyusei } from '../src/lib/kyusei';

const testDate = new Date('2026-01-31T12:00:00+09:00');
const result = calculateKyusei(testDate);

console.log(`Date: ${testDate.toISOString()}`);
console.log(`Expected Day Star: 六白金星`);
console.log(`Calculated Day Star: ${result.day.star.name}`);

if (result.day.star.name === '六白金星') {
    console.log('✅ Verification SUCCESS');
    process.exit(0);
} else {
    console.error('❌ Verification FAILED');
    process.exit(1);
}
