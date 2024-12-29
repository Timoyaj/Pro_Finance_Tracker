function validateForm(formId) {
    const form = document.getElementById(formId);
    if (!form) return false;

    const requiredFields = form.querySelectorAll('[required]');
    let isValid = true;

    requiredFields.forEach(field => {
        if (!field.value.trim()) {
            isValid = false;
            field.classList.add('border-red-500');
            
            // Add error message
            const errorMsg = document.createElement('p');
            errorMsg.className = 'text-red-500 text-xs mt-1';
            errorMsg.textContent = `${field.placeholder || field.name} is required`;
            
            // Remove existing error message if any
            const existingError = field.parentNode.querySelector('.text-red-500');
            if (existingError) existingError.remove();
            
            field.parentNode.appendChild(errorMsg);
        } else {
            field.classList.remove('border-red-500');
            const errorMsg = field.parentNode.querySelector('.text-red-500');
            if (errorMsg) errorMsg.remove();
        }
    });

    return isValid;
}

// Add this to all forms
document.addEventListener('DOMContentLoaded', () => {
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', (e) => {
            if (!validateForm(form.id)) {
                e.preventDefault();
            }
        });
    });
});
