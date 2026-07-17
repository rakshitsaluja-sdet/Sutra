# Business Requirements Document — Account Authentication

## 1. Background

The platform requires a login and registration flow so returning and new users can access personalized astrological readings. The flow must support both traditional email/password credentials and a passwordless OTP (one-time code) option.

## 2. Requirements

### 2.1 Email and password login

Returning users must be able to log in by entering their registered email address and password on the Login tab. If either field is left empty, the system must show the message "Please fill in all fields." and not attempt to submit. Successful login must redirect the user to the page they originally intended to visit, or the home page by default. The password field must support toggling visibility (show/hide) via an eye icon.

### 2.2 Email and password registration

New users must be able to create an account from the Register tab using the same email and password fields as login. The same "Please fill in all fields." validation applies if either field is empty.

### 2.3 OTP-based login

As an alternative to password login, users must be able to request a one-time login code by entering their email address on the OTP tab. If the entered value does not contain an "@" character, the system must show "Please enter a valid email address." and not send a code. On successful send, the system must show a confirmation message including the email address the code was sent to, and start a 60-second countdown before the user is allowed to request the code again.

### 2.4 Google sign-in

Users must be able to sign in using their Google account as an alternative to email/password or OTP. If Google sign-in is not available/configured on the backend, the system must show "Google login is not available right now. Please use OTP Login instead." rather than a generic error.
