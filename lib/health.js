/** Cálculos orientativos para el seguimiento personal, sin diagnóstico médico. */
export function ageYears(birthDate, reference = new Date()) {
  if (typeof birthDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const [y,m,d] = birthDate.split("-").map(Number);
  const birth = new Date(y,m-1,d);
  if (birth.getFullYear() !== y || birth.getMonth() !== m-1 || birth.getDate() !== d ||
      birth > reference || y < 1900) return null;
  let years = reference.getFullYear() - y;
  if (reference.getMonth()+1 < m || (reference.getMonth()+1 === m && reference.getDate() < d)) years--;
  return years;
}
export function bmiValue(weightKg, heightCm) {
  if (!Number.isFinite(weightKg) || !Number.isFinite(heightCm) ||
      weightKg <= 0 || heightCm < 90 || heightCm > 250) return null;
  return weightKg / ((heightCm / 100) ** 2);
}
export function bmiCategory(bmi, age) {
  if (!Number.isFinite(bmi) || !Number.isInteger(age) || age < 20) return null;
  if (bmi < 18.5) return "Bajo peso";
  if (bmi < 25) return "Normopeso";
  if (bmi < 30) return "Sobrepeso";
  if (bmi < 35) return "Obesidad · clase I";
  if (bmi < 40) return "Obesidad · clase II";
  return "Obesidad · clase III";
}
export function meanLastSevenDays(weights, reference = new Date()) {
  if (!Array.isArray(weights)) return null;
  const today = new Date(reference.getFullYear(), reference.getMonth(), reference.getDate());
  const minDay = new Date(today);
  minDay.setDate(minDay.getDate()-6);
  // Un valor por día, el último registrado en cada fecha: evita sesgos por varios pesajes.
  const byDay = new Map();
  for (const row of weights) {
    if (typeof row.date !== "string" || !Number.isFinite(row.value)) continue;
    const [y,m,d] = row.date.split("-").map(Number);
    const day = new Date(y,m-1,d);
    if (!Number.isFinite(day.getTime()) || day < minDay || day > today) continue;
    const existing = byDay.get(row.date);
    if (!existing || String(row.updatedAt || "") >= String(existing.updatedAt || "")) byDay.set(row.date,row);
  }
  if (byDay.size < 2) return null; // Una sola medición repetiría el último peso.
  return Array.from(byDay.values()).reduce((sum,row)=>sum+row.value,0)/byDay.size;
}
