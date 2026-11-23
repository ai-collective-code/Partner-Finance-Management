import React from 'react';
import LocalLoginForm from '../components/LocalLoginForm';

// Partner sign-in (ID + password, no Clerk)
const VendorLogin = () => <LocalLoginForm kind="partner" />;

export default VendorLogin;
