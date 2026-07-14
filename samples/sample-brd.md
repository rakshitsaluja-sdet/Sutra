# Business Requirements Document — Account Login

## 1. Background

The application currently has no automated coverage for the account login flow. This document describes the requirements for that flow so that automated test coverage can be generated from it.

## 2. Requirements

### 2.1 Successful login

Registered users must be able to log in to the application by providing their email address and password on the login page. When a user submits valid, matching credentials, the system must authenticate them and grant access to their account area.

### 2.2 Invalid credentials

If a user submits an email/password combination that does not match a registered account, the system must not authenticate the user. Instead, it must display a clear, visible error message on the login page indicating that the login attempt failed, and the user must remain on the login page.
