import React from 'react';
import LocalLoginForm from '../components/LocalLoginForm';

// Employee sign-in (ID + password, no Clerk)
const EmployeeLogin = () => <LocalLoginForm kind="employee" />;

export default EmployeeLogin;
