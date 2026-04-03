// Result Checker Frontend Logic
const API_URL = '/api';

// State
let admissionNumber = '';
let studentName = '';

// DOM Elements
const step1 = document.getElementById('step1');
const step2 = document.getElementById('step2');
const step3 = document.getElementById('step3');
const step1Indicator = document.getElementById('step1-indicator');
const step2Indicator = document.getElementById('step2-indicator');
const step3Indicator = document.getElementById('step3-indicator');
const admissionForm = document.getElementById('admissionForm');
const detailsForm = document.getElementById('detailsForm');
const studentNameDisplay = document.getElementById('studentNameDisplay');
const selectClass = document.getElementById('selectClass');
const selectTerm = document.getElementById('selectTerm');
const selectYear = document.getElementById('selectYear');
const loadingSpinner = document.getElementById('loadingSpinner');
const pdfContainer = document.getElementById('pdfContainer');
const pdfViewer = document.getElementById('pdfViewer');
const errorMessage = document.getElementById('errorMessage');
const resultActions = document.getElementById('resultActions');
const resultInfo = document.getElementById('resultInfo');

// Navigate to step
function goToStep(stepNum) {
  // Hide all steps
  [step1, step2, step3].forEach(step => step.classList.remove('active'));
  [step1Indicator, step2Indicator, step3Indicator].forEach(ind => {
    ind.classList.remove('active', 'completed');
  });

  // Show requested step
  if (stepNum === 1) {
    step1.classList.add('active');
    step1Indicator.classList.add('active');
  } else if (stepNum === 2) {
    step2.classList.add('active');
    step1Indicator.classList.add('completed');
    step2Indicator.classList.add('active');
  } else if (stepNum === 3) {
    step3.classList.add('active');
    step1Indicator.classList.add('completed');
    step2Indicator.classList.add('completed');
    step3Indicator.classList.add('active');
  }
}

// Step 1: Check Admission Number
admissionForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const input = document.getElementById('admissionNumber');
  admissionNumber = input.value.trim().toUpperCase();

  if (!admissionNumber) {
    alert('Please enter your admission number');
    return;
  }

  // Show loading
  const btn = admissionForm.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Checking...';

  try {
    const response = await fetch(`${API_URL}/check-admission`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admissionNumber })
    });

    const data = await response.json();

    if (data.success) {
      studentName = data.studentName;
      studentNameDisplay.textContent = `Student: ${studentName} (${admissionNumber})`;

      // Populate dropdowns
      const classes = [...new Set(data.results.map(r => r.class))];
      const terms = [...new Set(data.results.map(r => r.term))];
      const years = [...new Set(data.results.map(r => r.year))];

      selectClass.innerHTML = '<option value="">Select Class</option>';
      classes.forEach(c => {
        selectClass.innerHTML += `<option value="${c}">${c}</option>`;
      });

      selectTerm.innerHTML = '<option value="">Select Term</option>';
      terms.forEach(t => {
        selectTerm.innerHTML += `<option value="${t}">${t}</option>`;
      });

      selectYear.innerHTML = '<option value="">Select Year</option>';
      years.forEach(y => {
        selectYear.innerHTML += `<option value="${y}">${y}</option>`;
      });

      goToStep(2);
    } else {
      alert(data.message || 'Invalid Admission Number');
    }
  } catch (error) {
    alert('Connection error. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<span>Proceed</span><i class="fas fa-arrow-right"></i>';
  }
});

// Back button
document.getElementById('backBtn').addEventListener('click', () => {
  goToStep(1);
});

// Step 2: Get Result
detailsForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const classVal = selectClass.value;
  const termVal = selectTerm.value;
  const yearVal = selectYear.value;

  if (!classVal || !termVal || !yearVal) {
    alert('Please select all fields');
    return;
  }

  // Show loading
  loadingSpinner.style.display = 'block';
  pdfContainer.style.display = 'none';
  errorMessage.style.display = 'none';
  resultActions.style.display = 'none';
  goToStep(3);

  try {
    const response = await fetch(`${API_URL}/get-result`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        admissionNumber,
        class: classVal,
        term: termVal,
        year: yearVal
      })
    });

    const data = await response.json();

    if (data.success) {
      const result = data.result;

      // --- UPDATED SECTION FOR DATABASE STORAGE ---
      
      // Show PDF from Database Data
      loadingSpinner.style.display = 'none';
      
      // We create a "Data URL" from the base64 string sent by the server
      pdfViewer.src = `data:application/pdf;base64,${result.pdfData}`;
      
      pdfContainer.style.display = 'block';
      resultActions.style.display = 'flex';

      resultInfo.textContent = `${result.studentName} | ${result.class} | ${result.term} | ${result.year}`;

      // Download Button (Updated)
      document.getElementById('downloadBtn').onclick = () => {
        const link = document.createElement('a');
        link.href = `data:application/pdf;base64,${result.pdfData}`;
        link.download = `${result.admissionNumber}_${result.class}_${result.term}_${result.year}.pdf`;
        link.click();
      };

      // Print Button (Updated)
      document.getElementById('printBtn').onclick = () => {
        const printWindow = window.open('', '_blank');
        printWindow.document.write(`<iframe width='100%' height='100%' src='data:application/pdf;base64,${result.pdfData}'></iframe>`);
        printWindow.onload = () => { 
            printWindow.print(); 
        };
      };
      
      // ------------------------------------------

    } else {
      loadingSpinner.style.display = 'none';
      errorMessage.querySelector('p').textContent = data.message;
      errorMessage.style.display = 'flex';
    }
  } catch (error) {
    loadingSpinner.style.display = 'none';
    errorMessage.querySelector('p').textContent = 'Connection error. Please try again.';
    errorMessage.style.display = 'flex';
  }
});

// New Search button
document.getElementById('newSearchBtn').addEventListener('click', () => {
  document.getElementById('admissionNumber').value = '';
  admissionNumber = '';
  studentName = '';
  goToStep(1);
});