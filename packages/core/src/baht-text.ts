const words = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

function readInteger(digits: string, preceding = false): string {
  if (digits.length > 6) {
    return readInteger(digits.slice(0, -6), preceding) + 'ล้าน' + readInteger(digits.slice(-6), true);
  }
  return Array.from(digits, (digit, index) => {
    const place = digits.length - index - 1;
    const value = Number(digit);
    if (!value) return '';
    if (place === 0 && value === 1 && (preceding || Number(digits) > 10)) return 'เอ็ด';
    if (place === 1 && value === 1) return 'สิบ';
    if (place === 1 && value === 2) return 'ยี่สิบ';
    return words[value] + units[place];
  }).join('');
}

export function bahtText(amount: number): string {
  const [digits, exponent = '0'] = String(Math.abs(amount)).split('e');
  const satang = Math.round(Number(digits + 'e' + (Number(exponent) + 2)));
  if (!Number.isSafeInteger(satang)) throw new RangeError('จำนวนเงินเกินช่วงที่รองรับ');
  const baht = Math.floor(satang / 100);
  const fraction = satang % 100;
  const base = baht ? readInteger(String(baht)) + 'บาท' : fraction ? '' : 'ศูนย์บาท';
  return (amount < 0 && satang ? 'ลบ' : '') + base + (fraction ? readInteger(String(fraction)) + 'สตางค์' : 'ถ้วน');
}
