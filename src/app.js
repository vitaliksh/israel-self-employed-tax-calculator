import { loadParameters, resetParameters, saveParameters, isNewerVersion, hydrateParameters } from './tax-parameters.js';
import { calculateSelfEmployedTax } from './calculation-engine.js';
import { listClients, getClient, findClientByName, saveRecord, deleteRecord, deleteClient, exportClients, importClients } from './client-storage.js';

let parameters = loadParameters();
const currency = new Intl.NumberFormat('he-IL', { style:'currency', currency:'ILS', maximumFractionDigits:0 });
const $ = (selector) => document.querySelector(selector);
const numeric = (value) => Number(String(value).replaceAll(',', '')) || 0;
const parameterLabels = {
  creditPointAnnualValue: 'ערך שנתי של נקודת זיכוי',
  reducedMonthlyBase: 'בסיס חודשי לשיעור מופחת', maximumAnnualBase: 'תקרת הכנסה שנתית לביטוח', minimumAnnualBase: 'הכנסה שנתית מינימלית לביטוח',
  nationalReducedRate: 'שיעור ביטוח לאומי מופחת', nationalFullRate: 'שיעור ביטוח לאומי מלא', healthReducedRate: 'שיעור ביטוח בריאות מופחת', healthFullRate: 'שיעור ביטוח בריאות מלא',
  pensionDeductionRate: 'שיעור ניכוי פנסיה', pensionCreditRate: 'שיעור בסיס לזיכוי פנסיה', pensionCreditValueRate: 'שיעור הזיכוי בפנסיה', pensionEligibleIncomeCap: 'תקרת הכנסה להטבת פנסיה',
  studyFundDeductionRate: 'שיעור ניכוי קרן השתלמות', studyFundEligibleIncomeCap: 'תקרת הכנסה לקרן השתלמות'
};
const parameterNumber = (value) => Number(Number(value).toFixed(6)).toString();
const thousandFormat = new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 });

function input() {
  const values = Object.fromEntries([...new FormData($('#calculator-form'))].map(([key, value]) => [key, numeric(value)]));
  const optionalMoney = (selector) => { const field = $(selector); return field.value.trim() === '' ? null : numeric(field.value); };
  const actualInsurancePaid = optionalMoney('#actual-insurance-paid');
  const incomeTaxPaid = optionalMoney('#income-tax-paid');
  return { ...values, actualInsurancePaid, incomeTaxPaid, oldAgePension: $('#old-age-pension').checked, insuredSalary: values.salaryMonthly * values.salaryMonths, studyFundSalaryBase: 0 };
}
function format(value) { return currency.format(value); }
function formatMoneyInput(field) {
  const raw = field.value.replaceAll(',', '');
  if (!raw) return;
  field.value = thousandFormat.format(numeric(raw));
}
function formatMonetaryInputs(container = document) { container.querySelectorAll('[data-money]').forEach(formatMoneyInput); }
function render() {
  const result = calculateSelfEmployedTax(input(), parameters);
  $('#income-tax').value = format(result.incomeTax); $('#income-tax').textContent = format(result.incomeTax);
  $('#insurance').value = format(result.insurance.total); $('#insurance').textContent = format(result.insurance.total);
  $('#insurance-monthly').textContent = result.insurance.exempt
    ? 'פטור/ה מביטוח לאומי עקב קצבת זיקנה'
    : `תשלום חודשי: ${format(input().salaryMonths ? result.insurance.total / input().salaryMonths : 0)}`;
  $('#recommended-pension').textContent = format(result.benefits.annualPensionRecommendation);
  $('#recommended-study-fund').textContent = format(result.benefits.annualStudyFundRecommendation);
  $('#recommendation-note').textContent = input().selfIncome && input().salaryMonths
    ? (result.benefits.annualPensionRecommendation || result.benefits.annualStudyFundRecommendation
      ? 'המלצה שנתית המבוססת על חיסכון מס ממשי במודל הנוכחי. הפקדה מעבר לסכום אינה מוסיפה הטבת מס.'
      : 'לפי הנתונים שהוזנו, הפקדה נוספת אינה יוצרת הטבת מס בתקופת החישוב.')
    : 'יש להזין הכנסה ומספר חודשים כדי לקבל המלצה.';
  $('#pension-benefit').value = format(result.pensionBenefit.total); $('#pension-benefit').textContent = format(result.pensionBenefit.total);
  $('#pension-benefit-detail').textContent = `מס הכנסה: ${format(result.pensionBenefit.incomeTax)} · ביטוח לאומי: ${format(result.pensionBenefit.insurance)}`;
  $('#study-benefit').value = format(result.studyBenefit.total); $('#study-benefit').textContent = format(result.studyBenefit.total);
  $('#study-benefit-detail').textContent = `מס הכנסה: ${format(result.studyBenefit.incomeTax)} · ביטוח לאומי: ${format(result.studyBenefit.insurance)}`;
  $('#starting-income').textContent = format(result.combinedBeforeBenefits);
  $('#insurance-deduction').textContent = `−${format(result.insurance.incomeTaxDeduction)}`;
  $('#insurance-deduction-label').textContent = result.insurance.deductionSource === 'actual-paid'
    ? 'ניכוי ביטוח לאומי (לפי תשלום בפועל)'
    : 'ניכוי ביטוח לאומי';
  $('#pension-deduction').textContent = `−${format(result.benefits.pensionDeduction)}`;
  $('#study-deduction').textContent = `−${format(result.benefits.studyDeduction)}`;
  $('#taxable-income').value = format(result.combinedTaxable); $('#taxable-income').textContent = format(result.combinedTaxable);
  const rows = [
    ['שכר ברוטו לתקופה', format(result.salaryAnnual)], ['הכנסה משולבת לתקופה לפני הטבות', format(result.salaryAnnual + input().selfIncome)],
    ['הכנסה לא מבוטחת לפנסיה', format(result.benefits.uninsuredIncome)], ['ניכוי מוכר לפנסיה', `−${format(result.benefits.pensionDeduction)}`], ['זיכוי פנסיה', `−${format(result.benefits.pensionCredit)}`], ['ניכוי מוכר לקרן השתלמות', `−${format(result.benefits.studyDeduction)}`], [result.insurance.deductionSource === 'actual-paid' ? 'ניכוי ביטוח לאומי לפי תשלום בפועל' : '52% מביטוח לאומי כהוצאה מוכרת', `−${format(result.insurance.incomeTaxDeduction)}`],
    ['מדרגות מס ונקודות זיכוי לתקופה', `${input().salaryMonths} חודשים`], ['מס על השכר לפני נקודות זיכוי', format(result.salaryTax.gross)], ['נקודות זיכוי שנוצלו בשכר', `−${format(result.salaryTax.credits)}`], ['יתרת נקודות זיכוי לעסק', format(result.unusedCreditPointsValue)],
    ['מס בגין העסק לפני נקודות זיכוי', format(result.selfIncomeTaxBeforeCredits)], ['נקודות זיכוי שנוצלו בעסק', `−${format(result.creditPointsUsedForBusiness)}`], ['זיכוי פנסיה', `−${format(result.benefits.pensionCredit)}`],
    ['מס הכנסה בגין העסק', format(result.incomeTax)], ['בסיס ביטוח לאחר נוסחת ביטוח לאומי', format(result.insurance.adjustedBase)], ['בסיס ביטוח בשיעור מופחת', format(result.insurance.reducedBase)], ['בסיס ביטוח בשיעור מלא', format(result.insurance.fullBase)]
  ];
  $('#breakdown').innerHTML = rows.map(([name, value]) => `<dt>${name}</dt><dd>${value}</dd>`).join('');
  renderSettlement(result.settlement);
  renderFullCalculation(result);
}
function balanceLabel(balance) { return balance > 0 ? 'יתרה לתשלום' : balance < 0 ? 'צפוי החזר' : 'אין יתרה'; }
function balanceClass(balance) { return balance > 0 ? 'balance-due' : balance < 0 ? 'balance-refund' : ''; }
function balanceText(balance) { return balance ? `${balanceLabel(balance)}: ${format(Math.abs(balance))}` : 'אין יתרה'; }
function renderSettlement(settlement) {
  $('#settlement-card').classList.toggle('hidden', !settlement.entered);
  [['#settlement-income-tax', settlement.incomeTax], ['#settlement-insurance', settlement.insurance]].forEach(([selector, line]) => {
    const row = $(selector);
    row.querySelector('[data-cell="calculated"]').textContent = format(line.calculated);
    row.querySelector('[data-cell="paid"]').textContent = line.entered ? format(line.paid) : 'לא הוזן';
    const balanceCell = row.querySelector('[data-cell="balance"]');
    const shortLabel = line.balance > 0 ? 'לתשלום' : line.balance < 0 ? 'להחזר' : 'אין יתרה';
    balanceCell.innerHTML = line.entered ? `${format(Math.abs(line.balance))}<small>${shortLabel}</small>` : '—';
    balanceCell.className = line.entered ? balanceClass(line.balance) : '';
  });
  $('#settlement-total-label').textContent = `סה״כ ${balanceLabel(settlement.balance)}`;
  $('#settlement-total').value = format(Math.abs(settlement.balance)); $('#settlement-total').textContent = format(Math.abs(settlement.balance));
  $('#settlement-total').className = balanceClass(settlement.balance);
}
function parameterRows(object, group) { return Object.entries(object).flatMap(([key, value]) => {
  if (key === 'brackets' || key === 'surtaxThreshold' || key === 'surtaxRate' || typeof value === 'object') return [];
  const isRate = key.endsWith('Rate');
  return `<div class="parameter-row"><label>${parameterLabels[key] || key}${isRate ? ' (%)' : ''}<input data-group="${group}" data-key="${key}" ${isRate ? 'data-percent="true"' : 'data-money'} inputmode="decimal" value="${parameterNumber(isRate ? value * 100 : value)}"></label></div>`;
}).join(''); }
function renderSettings() {
  const editor = $('#parameter-editor');
  const brackets = parameters.incomeTax.brackets.map((bracket, index) => {
    const upperBound = Number.isFinite(bracket.upTo) ? `<input data-bracket="${index}" data-key="upTo" data-money inputmode="decimal" value="${parameterNumber(bracket.upTo)}">` : '<output class="open-ended">ללא הגבלה</output>';
    return `<div class="parameter-row"><label>עד סכום (מדרגה ${index + 1})${upperBound}</label><label>שיעור (%)<input data-bracket="${index}" data-key="rate" data-percent="true" inputmode="decimal" value="${parameterNumber(bracket.rate * 100)}"></label></div>`;
  }).join('');
  editor.innerHTML = `<h3>מס הכנסה</h3>${parameterRows(parameters.incomeTax, 'incomeTax')}<h3>מדרגות מס הכנסה</h3>${brackets}<h3>ביטוח לאומי ובריאות</h3>${parameterRows(parameters.insurance, 'insurance')}<h3>הטבות הפקדה</h3>${parameterRows(parameters.benefits, 'benefits')}<p class="muted">מקורות רשמיים: <a href="${parameters.metadata.sources.incomeTax}" target="_blank" rel="noreferrer">רשות המסים — מדרגות</a> · <a href="${parameters.metadata.sources.insurance}" target="_blank" rel="noreferrer">ביטוח לאומי — נוסחת בסיס</a> · <a href="${parameters.metadata.sources.benefits}" target="_blank" rel="noreferrer">רשות המסים — הטבות הפקדה</a>. תאריך משיכה: ${parameters.metadata.retrievedAt}.</p>`;
  formatMonetaryInputs(editor);
}
function saveEditedParameters() {
  $('#parameter-editor').querySelectorAll('[data-group]').forEach((field) => { parameters[field.dataset.group][field.dataset.key] = numeric(field.value) / (field.dataset.percent ? 100 : 1); });
  $('#parameter-editor').querySelectorAll('[data-bracket]').forEach((field) => { parameters.incomeTax.brackets[Number(field.dataset.bracket)][field.dataset.key] = numeric(field.value) / (field.dataset.percent ? 100 : 1); });
  saveParameters(parameters); render();
}
function renderFormulas() { $('#formula-list').innerHTML = [
  ['מס הכנסה', 'כל מדרגות המס, נקודות הזיכוי ותקרות ההטבה מותאמות למספר החודשים שנבחר. שלב 1: השכר ברוטו ממלא תחילה את מדרגות המס לתקופה ומנצל את נקודות הזיכוי לתקופה עד לגובה המס שלו. שלב 2: ההכנסה מעסק, לאחר ניכויים מוכרים, מחושבת רק מהיתרה במדרגה שבה הסתיים השכר ומהמדרגות שמעליה. שלב 3: מהמס בגין העסק מופחתות רק נקודות הזיכוי שלא נוצלו בשכר וזיכוי הפנסיה. המס שנוכה מהשכר אינו מתווסף לתוצאה — התוצאה היא המס בגין ההכנסה כעצמאי בלבד.', 'Tax business = max(0, Tax(salary + business − deductions) − Tax(salary) − unused credit points − pension credit)'],
    ['ביטוח לאומי ובריאות', 'מקבל/ת קצבת זיקנה פטור/ה מחישוב זה. אחרת, בסיס הביטוח מחושב רק מההכנסה מעסק לפי נוסחת ביטוח לאומי. השכר אינו מחויב כאן; הוא משמש רק לקביעת המדרגה ולבדיקת תקרת ההכנסה. כאשר מוזן תשלום בפועל, רק הניכוי למס הכנסה מוחלף: 65% מהסכום נחשבים לביטוח לאומי ומהם 52% מוכרים לניכוי.', 'X = (Y + B × 0.52 × (t2 − t1)) / (1 + 0.52 × t2)'],
  ['פנסיה וקרן השתלמות', 'הפקדה שנתית מומרת תחילה לחלק היחסי בתקופה. ניכוי פנסיה מחושב עד 11% מהכנסה עסקית שאינה מבוטחת; יתרה עשויה לזכות בזיכוי של 35% עד 5%. קרן השתלמות: עד 4.5% מהכנסה עסקית, לאחר קיזוז שכר קובע שבו המעסיק הפקיד לקרן.', 'period contribution = annual contribution × months / 12'],
  ['יתרה לתשלום או להחזר', 'לכל תשלום בנפרד: הסכום המחושב לתקופה פחות הסכום ששולם עבור אותה תקופה. מס הכנסה מושווה למס בגין העסק בלבד (ללא המס שנוכה מהשכר). ביטוח לאומי מושווה לסך ביטוח לאומי ובריאות. יתרה חיובית — לתשלום; יתרה שלילית — צפוי החזר. תשלום שלא הוזן אינו נכלל בסיכום.', 'balance = calculated − paid; total = balance(income tax) + balance(insurance)']
].map(([title, text, equation]) => `<article class="formula"><h3>${title}</h3><p>${text}</p><p class="formula-equation">${equation}</p></article>`).join(''); }

function renderFullCalculation(result) {
  const rows = (items) => `<dl>${items.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('')}</dl>`;
  const brackets = (title, taxRows, compareRows = null) => {
    const items = taxRows.map((row, index) => {
      const difference = compareRows ? Math.max(0, row.tax - compareRows[index].tax) : row.tax;
      const taxableAmount = compareRows ? Math.max(0, row.amount - compareRows[index].amount) : row.amount;
      if (!taxableAmount) return '';
      const range = Number.isFinite(row.upper) ? `${format(row.lower)}–${format(row.upper)}` : `מעל ${format(row.lower)}`;
      return `<li><span><span class="calculation-label">${range} × ${parameterNumber(row.rate * 100)}%</span><br>${format(taxableAmount)}</span><strong>${format(difference)}</strong></li>`;
    }).join('');
    return `<h3>${title}</h3><ul class="bracket-list">${items || '<li><span>אין סכום חייב במדרגות אלו</span><strong>₪0</strong></li>'}</ul>`;
  };
  const periodPointValue = result.salaryTax.creditPointValueForPeriod;
  const allPointsValue = input().creditPoints * periodPointValue;
  $('#full-calculation').innerHTML = `
    <section><h3>מס הכנסה</h3><p class="subtle">תקופת החישוב: ${input().salaryMonths} חודשים</p>${rows([
      ['שכר ברוטו לתקופה', format(result.salaryAnnual)], ['הכנסה מעסק לתקופה', format(input().selfIncome)], ['ניכוי ביטוח לאומי', result.insurance.deductionSource === 'actual-paid' ? `תשלום בפועל ${format(result.insurance.actualPaidTotal)} × 65% × 52% = −${format(result.insurance.incomeTaxDeduction)}` : `−${format(result.insurance.incomeTaxDeduction)}`], ['ניכויים מוכרים', `−${format(result.benefits.totalDeduction + result.insurance.incomeTaxDeduction)}`], ['הכנסה חייבת למס לתקופה', format(result.combinedTaxable)]
    ])}${brackets('חישוב מס על השכר לפני נקודות זיכוי', result.salaryTax.brackets)}${brackets('חישוב מס בגין העסק לפני נקודות זיכוי', result.combinedTax.brackets, result.salaryTax.brackets)}${rows([
      ['שווי נקודת זיכוי אחת לתקופה', format(periodPointValue)], ['חישוב נקודות זיכוי לתקופה', `${input().creditPoints} × ${format(periodPointValue)} = ${format(allPointsValue)}`], ['נקודות זיכוי שנוצלו בשכר', `−${format(result.salaryTax.credits)}`], ['יתרת נקודות זיכוי לעסק', format(result.unusedCreditPointsValue)], ['נקודות זיכוי שנוצלו בעסק', `−${format(result.creditPointsUsedForBusiness)}`], ['זיכוי פנסיה', `−${format(result.benefits.pensionCredit)}`], ['מס הכנסה סופי בגין העסק', format(result.incomeTax)]
    ])}</section>
    <section><h3>ביטוח לאומי</h3><p class="subtle">${result.insurance.exempt ? 'מקבל/ת קצבת זיקנה: ביטוח לאומי והניכוי בגינו הם ₪0.' : `הסכומים מותאמים ל-${input().salaryMonths} חודשים.`}</p>${result.insurance.exempt ? '' : rows([
      ['הכנסה מעסק', format(input().selfIncome)], ['ניכוי פנסיה בבסיס ביטוח לאומי', `−${format(result.insurance.pensionFundDeduction)}`], ['ניכוי קרן השתלמות בבסיס ביטוח לאומי', `−${format(result.insurance.studyFundDeduction)}`], ['הכנסה לעסק לאחר ניכויי הפקדות', format(result.insurance.incomeAfterContributionDeductions)], ['שכר לקביעת מדרגה ותקרה בלבד', format(result.salaryAnnual)], ['תקרת בסיס לתקופה', format(result.insurance.maximumBaseForPeriod)], ['בסיס לפני התאמה', format(result.insurance.rawBase)], ['בסיס לאחר נוסחת התאמה', format(result.insurance.adjustedBase)], ['בסיס בשיעור מופחת', format(result.insurance.reducedBase)], ['בסיס בשיעור מלא', format(result.insurance.fullBase)], ['ביטוח לאומי', format(result.insurance.national)], ['ביטוח בריאות', format(result.insurance.health)], ['סה״כ ביטוח לאומי ובריאות', format(result.insurance.total)]
    ])}</section>
    <section><h3>הפקדות לתקופה</h3>${rows([
      ['הפקדה שנתית לפנסיה', format(input().pension)], ['חלק הפנסיה לתקופה', format(result.benefits.pensionContributionForPeriod)], ['הפקדה שנתית לקרן השתלמות', format(input().studyFund)], ['חלק קרן ההשתלמות לתקופה', format(result.benefits.studyContributionForPeriod)]
    ])}</section>${settlementDetails(result.settlement)}`;
}
function settlementDetails(settlement) {
  if (!settlement.entered) return '';
  const line = (name, item) => item.entered
    ? [[`${name}: מחושב − שולם`, `${format(item.calculated)} − ${format(item.paid)}`], [name, balanceText(item.balance)]]
    : [[name, 'לא הוזן תשלום — לא נכלל בסיכום']];
  return `<section><h3>יתרה לתשלום או להחזר</h3><dl>${[
    ...line('מס הכנסה', settlement.incomeTax), ...line('ביטוח לאומי ובריאות', settlement.insurance), [`סה״כ ${balanceLabel(settlement.balance)}`, format(Math.abs(settlement.balance))]
  ].map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('')}</dl></section>`;
}

// ---- Clients: dated versions of calculator inputs, stored in this browser only ----
let currentClientId = '';
let currentRecordId = '';
let savedSnapshot = '';
const DEFAULT_FIELD_VALUES = { creditPoints: '2.25' };
const recordDate = new Intl.DateTimeFormat('he-IL', { dateStyle: 'short', timeStyle: 'short' });

function formFields() { return [...$('#calculator-form').elements].filter((field) => field.name); }
function readFormInputs() {
  return Object.fromEntries(formFields().map((field) => [field.name, field.type === 'checkbox' ? field.checked : field.value]));
}
function writeFormInputs(inputs) {
  formFields().forEach((field) => {
    const value = inputs[field.name] ?? DEFAULT_FIELD_VALUES[field.name] ?? '';
    if (field.type === 'checkbox') field.checked = Boolean(value); else field.value = value;
  });
  formatMonetaryInputs($('#calculator-form'));
  render();
}
function snapshot() { return JSON.stringify({ name: $('#client-name').value.trim(), inputs: readFormInputs() }); }
function isDirty() { return snapshot() !== savedSnapshot; }
function markSaved() { savedSnapshot = snapshot(); updateClientStatus(); }
/** Before leaving the current client or version: save, discard or stay. Resolves true when it is safe to continue. */
async function resolveUnsavedChanges() {
  if (!isDirty()) return true;
  const name = $('#client-name').value.trim();
  $('#unsaved-message').textContent = name ? `יש שינויים שלא נשמרו עבור "${name}".` : 'יש שינויים שלא נשמרו.';
  const dialog = $('#unsaved-dialog');
  dialog.returnValue = '';
  const choice = await new Promise((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue), { once: true });
    dialog.showModal();
  });
  if (choice === 'save') return saveCurrentClient();
  return choice === 'discard';
}
function recordLabel(record) {
  const months = numeric(record.inputs.salaryMonths);
  const income = numeric(record.inputs.selfIncome);
  return `${recordDate.format(new Date(record.savedAt))} · ${months} ח׳ · הכנסה ${format(income)}`;
}
function updateClientStatus(message = '') {
  const client = currentClientId ? getClient(currentClientId) : null;
  const record = client?.records.find((item) => item.id === currentRecordId);
  const base = client ? `${client.name} · ${client.records.length} גרסאות שמורות` : 'לקוח חדש — טרם נשמר';
  const dirty = isDirty() ? ' · יש שינויים שלא נשמרו' : '';
  $('#client-status').textContent = message || base + dirty;
  $('#client-status').classList.toggle('client-status-dirty', !message && isDirty());
  renderPrintHeader(client, record);
}
function renderClientControls() {
  const clients = listClients();
  $('#client-select').innerHTML = '<option value="">— לקוח חדש —</option>'
    + clients.map((client) => `<option value="${client.id}">${escapeHtml(client.name)}</option>`).join('');
  $('#client-select').value = currentClientId;
  const client = clients.find((item) => item.id === currentClientId);
  const hasRecords = Boolean(client?.records.length);
  $('#record-field').classList.toggle('hidden', !hasRecords);
  $('#record-select').innerHTML = hasRecords ? client.records.map((record) => `<option value="${record.id}">${recordLabel(record)}</option>`).join('') : '';
  if (hasRecords) $('#record-select').value = currentRecordId;
  $('#delete-record').classList.toggle('hidden', !hasRecords);
  $('#delete-client').classList.toggle('hidden', !client);
  updateClientStatus();
}
function escapeHtml(text) { return String(text).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]); }
function loadClient(clientId, recordId = '') {
  const client = getClient(clientId);
  if (!client) { startNewClient(); return; }
  const record = client.records.find((item) => item.id === recordId) || client.records[0];
  currentClientId = client.id; currentRecordId = record?.id || '';
  $('#client-name').value = client.name;
  writeFormInputs(record?.inputs || {});
  markSaved(); renderClientControls();
}
function startNewClient() {
  currentClientId = ''; currentRecordId = '';
  $('#client-name').value = '';
  writeFormInputs({});
  markSaved(); renderClientControls();
}
function saveCurrentClient() {
  const name = $('#client-name').value.trim();
  if (!name) { updateClientStatus('יש להזין שם ומשפחה לפני השמירה.'); $('#client-name').focus(); return false; }
  let clientId = currentClientId;
  if (!clientId) {
    const existing = findClientByName(name);
    if (existing) {
      if (!window.confirm(`הלקוח "${existing.name}" כבר קיים. לשמור כגרסה חדשה שלו?\n(ביטול — לא לשמור, כדי לשנות את השם)`)) { $('#client-name').focus(); return false; }
      clientId = existing.id;
    }
  }
  const saved = saveRecord(clientId, name, readFormInputs());
  currentClientId = saved.clientId; currentRecordId = saved.recordId;
  markSaved(); renderClientControls();
  updateClientStatus(`נשמרה גרסה חדשה: ${recordDate.format(new Date())}`);
  return true;
}

$('#client-select').addEventListener('change', async (event) => {
  const target = event.target.value;
  event.target.value = currentClientId;
  if (!(await resolveUnsavedChanges())) { renderClientControls(); return; }
  if (target) loadClient(target); else startNewClient();
});
$('#record-select').addEventListener('change', async (event) => {
  const clientId = currentClientId;
  const target = event.target.value;
  event.target.value = currentRecordId;
  if (!(await resolveUnsavedChanges())) { renderClientControls(); return; }
  loadClient(clientId, target);
});
$('#client-name').addEventListener('input', () => updateClientStatus());
$('#save-client').addEventListener('click', saveCurrentClient);
$('#new-client').addEventListener('click', async () => { if (await resolveUnsavedChanges()) startNewClient(); });
$('#delete-record').addEventListener('click', () => {
  const client = getClient(currentClientId);
  const record = client?.records.find((item) => item.id === currentRecordId);
  if (!record || !window.confirm(`למחוק את הגרסה מ־${recordDate.format(new Date(record.savedAt))}? לא ניתן לשחזר.`)) return;
  deleteRecord(client.id, record.id);
  if (getClient(client.id)?.records.length) loadClient(client.id); else { savedSnapshot = ''; renderClientControls(); }
});
$('#delete-client').addEventListener('click', () => {
  const client = getClient(currentClientId);
  if (!client || !window.confirm(`למחוק את הלקוח "${client.name}" ואת כל ${client.records.length} הגרסאות שלו? לא ניתן לשחזר.`)) return;
  deleteClient(client.id); startNewClient();
});
$('#export-clients').addEventListener('click', () => {
  const blob = new Blob([exportClients()], { type: 'application/json' });
  const link = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `tax-calculator-clients-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});
$('#import-clients').addEventListener('click', () => $('#import-file').click());
$('#import-file').addEventListener('change', async (event) => {
  const [file] = event.target.files;
  event.target.value = '';
  if (!file) return;
  try {
    const { addedClients, addedRecords } = importClients(await file.text());
    renderClientControls();
    updateClientStatus(`יובאו ${addedClients} לקוחות חדשים ו־${addedRecords} גרסאות.`);
  } catch { updateClientStatus('הקובץ אינו קובץ גיבוי תקין של המחשבון.'); }
});
window.addEventListener('beforeunload', (event) => {
  if ((currentClientId || $('#client-name').value.trim()) && isDirty()) event.preventDefault();
});

// ---- Print: current client state, without controls ----
function renderPrintHeader(client, record) {
  const name = client?.name || $('#client-name').value.trim();
  const parts = [name ? `לקוח: ${escapeHtml(name)}` : '', record ? `גרסה מ־${recordDate.format(new Date(record.savedAt))}` : '', `הופק: ${recordDate.format(new Date())}`].filter(Boolean);
  $('#print-header').innerHTML = `<h2>מחשבון מס לעצמאי — 2026</h2><p>${parts.join(' · ')}</p>`;
}
function renderPrintInputs() {
  const rows = formFields().flatMap((field) => {
    const label = field.closest('label')?.firstChild?.textContent.trim() || field.name;
    if (field.type === 'checkbox') return field.checked ? [[field.closest('label').textContent.trim(), 'כן']] : [];
    if (field.value.trim() === '') return [];
    return [[label, field.matches('[data-money]') ? format(numeric(field.value)) : field.value]];
  });
  $('#print-inputs').innerHTML = `<h2>נתונים שהוזנו</h2><dl>${rows.map(([label, value]) => `<dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>`;
}
function preparePrintContent() { updateClientStatus(); renderPrintInputs(); }
window.addEventListener('beforeprint', preparePrintContent);
$('#print-button').addEventListener('click', () => window.print());

// ---- Copy: the same content as the printout, as formatted HTML and plain text ----
const clean = (text) => String(text ?? '').replace(/\s+/g, ' ').trim();
function isShown(element) { return element && !element.classList.contains('hidden') && !element.closest('details:not([open])'); }
function dlRows(dl) { return [...dl.querySelectorAll(':scope > dt')].map((dt) => [clean(dt.textContent), clean(dt.nextElementSibling?.textContent)]); }
/** Turns a results container into blocks: { heading } or { rows, header? }. */
function contentBlocks(container) {
  const blocks = [];
  const walk = (node) => [...node.children].forEach((child) => {
    if (child.matches('h2, h3, summary')) blocks.push({ heading: clean(child.textContent) });
    else if (child.matches('dl')) blocks.push({ rows: dlRows(child) });
    else if (child.matches('ul.bracket-list')) blocks.push({ rows: [...child.children].map((li) => [clean(li.querySelector('span')?.innerText.replace(/\n/g, ' — ')), clean(li.querySelector('strong')?.textContent)]) });
    else if (child.matches('table')) blocks.push({ header: [...child.querySelectorAll('thead th')].map((th) => clean(th.textContent)), rows: [...child.querySelectorAll('tbody tr')].map((tr) => [...tr.children].map((cell) => clean(cell.innerText.replace(/\n/g, ' ')))) });
    else if (child.matches('.taxable-total, .settlement-total')) blocks.push({ rows: [[clean(child.querySelector('span').textContent), clean(child.querySelector('output').textContent)]], total: true });
    else if (child.matches('p.subtle')) blocks.push({ note: clean(child.textContent) });
    else if (child.matches('section, div, details, header') && !child.matches('.divider')) walk(child);
  });
  walk(container);
  return blocks;
}
function copySections() {
  preparePrintContent();
  const sections = [];
  const header = $('#print-header');
  sections.push({ title: clean(header.querySelector('h2').textContent), subtitle: clean(header.querySelector('p').textContent), blocks: [] });
  sections.push({ blocks: contentBlocks($('#print-inputs')) });
  sections.push({ blocks: contentBlocks($('.taxable-card')) });
  sections.push({ blocks: [{ heading: 'תוצאות' }, { rows: [...document.querySelectorAll('.result-grid article')].map((card) => [clean(card.querySelector('h3').textContent), clean(card.querySelector('output').textContent), clean(card.querySelector('small')?.textContent)]) }] });
  if (isShown($('#settlement-card'))) sections.push({ blocks: contentBlocks($('#settlement-card')) });
  sections.push({ blocks: contentBlocks($('.recommendation-card')).concat({ note: clean($('#recommendation-note').textContent) }) });
  document.querySelectorAll('.results > details[open]').forEach((details) => sections.push({ blocks: contentBlocks(details) }));
  return sections;
}
function sectionsToHtml(sections) {
  const cell = 'border:1px solid #d9e2ec;padding:4px 8px;text-align:right;vertical-align:top;';
  const table = (block) => `<table dir="rtl" style="border-collapse:collapse;margin:0 0 10px;">${block.header ? `<tr>${block.header.map((text) => `<th style="${cell}background:#f0f7f7;">${escapeHtml(text)}</th>`).join('')}</tr>` : ''}${block.rows.map((row) => `<tr>${row.map((text, index) => `<td style="${cell}${index || block.total ? 'font-weight:bold;' : ''}">${escapeHtml(text)}</td>`).join('')}</tr>`).join('')}</table>`;
  const body = sections.map((section) => [
    section.title ? `<h2 style="color:#0f766e;margin:0;">${escapeHtml(section.title)}</h2><p style="color:#627d98;margin:2px 0 12px;">${escapeHtml(section.subtitle)}</p>` : '',
    ...section.blocks.map((block) => block.heading ? `<h3 style="margin:12px 0 6px;">${escapeHtml(block.heading)}</h3>` : block.note ? `<p style="color:#627d98;margin:0 0 8px;">${escapeHtml(block.note)}</p>` : table(block))
  ].join('')).join('');
  return `<div dir="rtl" style="font-family:Arial,sans-serif;font-size:11pt;color:#102a43;">${body}</div>`;
}
function sectionsToText(sections) {
  return sections.map((section) => [
    section.title ? `${section.title}\n${section.subtitle}` : '',
    ...section.blocks.map((block) => block.heading ? `\n*${block.heading}*` : block.note ? block.note
      : [block.header?.filter(Boolean).join(' | '), ...block.rows.map((row) => row.length === 2 ? `${row[0]}: ${row[1]}` : row.filter(Boolean).join(' | '))].filter(Boolean).join('\n'))
  ].filter(Boolean).join('\n')).join('\n');
}
async function writeClipboard(html, text) {
  if (navigator.clipboard?.write && window.ClipboardItem) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      return;
    } catch { /* fall through to plain text */ }
  }
  if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return; }
  const area = Object.assign(document.createElement('textarea'), { value: text });
  area.style.position = 'fixed'; area.style.opacity = '0';
  document.body.append(area); area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('copy-failed');
}
async function copyResults() {
  const button = $('#copy-button');
  const sections = copySections();
  try {
    await writeClipboard(sectionsToHtml(sections), sectionsToText(sections));
    button.textContent = 'הועתק ✓';
  } catch { button.textContent = 'ההעתקה נכשלה'; }
  window.setTimeout(() => { button.textContent = 'העתקה'; }, 1800);
}
$('#copy-button').addEventListener('click', copyResults);

$('#calculator-form').addEventListener('input', (event) => { if (event.target.matches('[data-money]')) formatMoneyInput(event.target); render(); updateClientStatus(); });
$('#settings-button').addEventListener('click', () => { renderSettings(); $('#settings-dialog').showModal(); });
$('#settings-form').addEventListener('submit', () => { saveEditedParameters(); });
$('#reset-parameters').addEventListener('click', () => { parameters = resetParameters(); renderSettings(); render(); });
$('#update-button').addEventListener('click', checkForUpdate);
$('#data-version').textContent = parameters.metadata.version;
formatMonetaryInputs(); renderFormulas(); render(); markSaved(); renderClientControls();

async function checkForUpdate() {
  const button = $('#update-button');
  button.disabled = true; button.textContent = 'בודק…';
  try {
    const response = await fetch('./data/tax-parameters-2026.json', { cache: 'no-store' });
    const candidate = await response.json();
    if (isNewerVersion(candidate, parameters)) {
      parameters = hydrateParameters(candidate); saveParameters(parameters);
      $('#data-version').textContent = parameters.metadata.version;
      $('#data-updated').classList.remove('hidden'); render();
    } else { button.textContent = 'הנתונים עדכניים'; }
  } catch { button.textContent = 'לא ניתן לעדכן כעת'; }
  finally { window.setTimeout(() => { button.disabled = false; button.textContent = 'בדיקת עדכון'; }, 1800); }
}
