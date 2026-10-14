// Employee id: localStorage (survives reload, FR-1). Admin PIN: sessionStorage only, never localStorage (FR-9).
const EMPLOYEE_KEY = 'snack.employee';
const PIN_KEY = 'snack.adminPin';

export const getEmployee = () => localStorage.getItem(EMPLOYEE_KEY);
export const setEmployee = (id) => localStorage.setItem(EMPLOYEE_KEY, String(id));
export const clearEmployee = () => localStorage.removeItem(EMPLOYEE_KEY);

export const getPin = () => sessionStorage.getItem(PIN_KEY);
export const setPin = (pin) => sessionStorage.setItem(PIN_KEY, pin);
export const clearPin = () => sessionStorage.removeItem(PIN_KEY);
