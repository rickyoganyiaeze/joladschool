// Admin Dashboard Logic
const API_URL = window.location.origin + '/api';

// Check authentication
const token = localStorage.getItem('adminToken');
const username = localStorage.getItem('adminUsername');

if (!token) {
  window.location.href = '/admin';
}

// Display username
document.getElementById('adminUsername').textContent = username || 'Admin';

// Logout
document.getElementById('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('adminToken');
  localStorage.removeItem('adminUsername');
  window.location.href = '/admin';
});

// Navigation
const navLinks = document.querySelectorAll('.admin-nav-link');
const sections = document.querySelectorAll('.admin-section');

navLinks.forEach(link => {
  link.addEventListener('click', (e) => {
    if (link.dataset.section) {
      e.preventDefault();
      
      navLinks.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      
      sections.forEach(s => s.classList.remove('active'));
      document.getElementById(`${link.dataset.section}Section`).classList.add('active');
    }
  });
});

// File upload UI
const fileInput = document.getElementById('pdfFile');
const fileUpload = document.getElementById('fileUpload');
const fileSelected = document.querySelector('.file-selected');
const selectedFileName = document.getElementById('selectedFileName');
const removeFileBtn = document.getElementById('removeFile');

fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) {
    const file = e.target.files[0];
    if (file.type !== 'application/pdf') {
      alert('Please select a PDF file');
      fileInput.value = '';
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert('File size must be less than 10MB');
      fileInput.value = '';
      return;
    }
    selectedFileName.textContent = file.name;
    document.querySelector('.file-upload-content').style.display = 'none';
    fileSelected.style.display = 'flex';
  }
});

removeFileBtn.addEventListener('click', (e) => {
  e.preventDefault();
  fileInput.value = '';
  document.querySelector('.file-upload-content').style.display = 'block';
  fileSelected.style.display = 'none';
});

// Populate class select for edit
const classOptions = `
  <optgroup label="Nursery">
    <option value="Creche">Creche</option>
    <option value="Playgroup">Playgroup</option>
    <option value="Nursery 1">Nursery 1</option>
    <option value="Nursery 2">Nursery 2</option>
    <option value="Nursery 3">Nursery 3</option>
  </optgroup>
  <optgroup label="Primary">
    <option value="Primary 1">Primary 1</option>
    <option value="Primary 2">Primary 2</option>
    <option value="Primary 3">Primary 3</option>
    <option value="Primary 4">Primary 4</option>
    <option value="Primary 5">Primary 5</option>
    <option value="Primary 6">Primary 6</option>
  </optgroup>
  <optgroup label="Junior Secondary">
    <option value="JSS 1">JSS 1</option>
    <option value="JSS 2">JSS 2</option>
    <option value="JSS 3">JSS 3</option>
  </optgroup>
  <optgroup label="Senior Secondary">
    <option value="SS 1">SS 1</option>
    <option value="SS 2">SS 2</option>
    <option value="SS 3">SS 3</option>
  </optgroup>
`;
document.getElementById('editClass').innerHTML = classOptions;

// Upload result
document.getElementById('uploadForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData(e.target);
  
  const btn = e.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Uploading...';
  
  try {
    const response = await fetch(`${API_URL}/admin/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      alert('Result uploaded successfully!');
      e.target.reset();
      document.querySelector('.file-upload-content').style.display = 'block';
      fileSelected.style.display = 'none';
      loadResults();
    } else {
      alert(data.message || 'Upload failed');
    }
  } catch (error) {
    alert('Connection error. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-upload"></i> Upload Result';
  }
});

// Load results
let allResults = [];

async function loadResults() {
  try {
    const response = await fetch(`${API_URL}/admin/results`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      allResults = data.results;
      displayResults(allResults);
    }
  } catch (error) {
    console.error('Error loading results:', error);
  }
}

function displayResults(results) {
  const tbody = document.getElementById('resultsTableBody');
  
  if (results.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No results found</td></tr>';
    return;
  }
  
  tbody.innerHTML = results.map(result => `
    <tr>
      <td>${result.admissionNumber}</td>
      <td>${result.studentName}</td>
      <td>${result.class}</td>
      <td>${result.term}</td>
      <td>${result.year}</td>
      <td>
        <div class="action-btns">
          <button class="action-btn edit" onclick="editResult('${result._id}')" title="Edit">
            <i class="fas fa-edit"></i>
          </button>
          <button class="action-btn delete" onclick="deleteResult('${result._id}')" title="Delete">
            <i class="fas fa-trash"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

// Search results
document.getElementById('searchResults').addEventListener('input', (e) => {
  const query = e.target.value.toLowerCase();
  const filtered = allResults.filter(r => 
    r.admissionNumber.toLowerCase().includes(query) ||
    r.studentName.toLowerCase().includes(query)
  );
  displayResults(filtered);
});

// Edit result
let currentEditId = null;

window.editResult = async (id) => {
  try {
    const response = await fetch(`${API_URL}/admin/results/${id}`, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      const result = data.result;
      currentEditId = id;
      
      document.getElementById('editId').value = id;
      document.getElementById('editAdmissionNumber').value = result.admissionNumber;
      document.getElementById('editStudentName').value = result.studentName;
      document.getElementById('editClass').value = result.class;
      document.getElementById('editTerm').value = result.term;
      document.getElementById('editYear').value = result.year;
      
      document.getElementById('editModal').classList.add('active');
    }
  } catch (error) {
    alert('Error loading result details');
  }
};

// Close modals
document.getElementById('closeEditModal').addEventListener('click', () => {
  document.getElementById('editModal').classList.remove('active');
});

document.getElementById('closeDeleteModal').addEventListener('click', () => {
  document.getElementById('deleteModal').classList.remove('active');
});

document.getElementById('cancelEdit').addEventListener('click', () => {
  document.getElementById('editModal').classList.remove('active');
});

document.getElementById('cancelDelete').addEventListener('click', () => {
  document.getElementById('deleteModal').classList.remove('active');
});

// Save edit
document.getElementById('editForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const formData = new FormData();
  formData.append('admissionNumber', document.getElementById('editAdmissionNumber').value);
  formData.append('studentName', document.getElementById('editStudentName').value);
  formData.append('class', document.getElementById('editClass').value);
  formData.append('term', document.getElementById('editTerm').value);
  formData.append('year', document.getElementById('editYear').value);
  
  const pdfFile = document.getElementById('editPdf').files[0];
  if (pdfFile) {
    formData.append('pdf', document.getElementById('pdfFile').files[0]);
  }
  
  try {
    const response = await fetch(`${API_URL}/admin/results/${currentEditId}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`
      },
      body: formData
    });
    
    const data = await response.json();
    
    if (response.ok && data.success) {
      alert('Result updated successfully!');
      document.getElementById('editModal').classList.remove('active');
      loadResults();
    } else {
      alert(data.message || 'Update failed');
    }
  } catch (error) {
    alert('Connection error. Please try again.');
  }
});

// Delete result
let currentDeleteId = null;

window.deleteResult = (id) => {
  currentDeleteId = id;
  document.getElementById('deleteModal').classList.add('active');
};

document.getElementById('confirmDelete').addEventListener('click', async () => {
  try {
    const response = await fetch(`${API_URL}/admin/results/${currentDeleteId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    
    const data = await response.json();
    
    if (data.success) {
      alert('Result deleted successfully!');
      document.getElementById('deleteModal').classList.remove('active');
      loadResults();
    } else {
      alert(data.message || 'Delete failed');
    }
  } catch (error) {
    alert('Connection error. Please try again.');
  }
});

// Initial load
loadResults();

// Show upload section by default
document.querySelector('[data-section="upload"]').click();